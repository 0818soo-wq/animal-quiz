const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const fs = require("fs");
const path = require("path");

const VOICE = "ko-KR-SunHiNeural";
const OUT_DIR = path.join(__dirname, "..", "audio");
fs.mkdirSync(OUT_DIR, { recursive: true });

const ANIMALS = require("../data.js");

function hasFinalConsonant(word) {
  const code = word.charCodeAt(word.length - 1) - 0xAC00;
  if (code < 0 || code > 11171) return false;
  return code % 28 !== 0;
}
function wasParticle(word) {
  return hasFinalConsonant(word) ? "이었어요" : "였어요";
}

const jobs = [];
jobs.push({ file: "shared-intro.mp3", text: "나는 누구일까요? 맞춰보세요!" });
jobs.push({ file: "shared-more-hint.mp3", text: "땡, 힌트를 하나 더 드리자면~" });
jobs.push({ file: "shared-correct.mp3", text: "딩동댕~ 정답이에요!" });

for (const a of ANIMALS) {
  jobs.push({ file: `${a.id}-hint1.mp3`, text: a.hints[0] });
  jobs.push({ file: `${a.id}-hint2.mp3`, text: a.hints[1] });
  jobs.push({ file: `${a.id}-hint3.mp3`, text: a.hints[2] });
  jobs.push({ file: `${a.id}-reveal.mp3`, text: `땡! 정답은 ${a.name}${wasParticle(a.name)}.` });
}

// skip files that already exist and are non-empty (so re-runs after a crash only fill gaps)
const remaining = jobs.filter(j => {
  const p = path.join(OUT_DIR, j.file);
  return !(fs.existsSync(p) && fs.statSync(p).size > 0);
});

console.log(`total jobs: ${jobs.length}, remaining: ${remaining.length}`);

function synthOne(tts, text, outPath) {
  return new Promise((resolve, reject) => {
    let audioStream;
    try {
      ({ audioStream } = tts.toStream(text));
    } catch (e) {
      reject(e);
      return;
    }
    const ws = fs.createWriteStream(outPath);
    audioStream.pipe(ws);
    audioStream.once("error", (e) => {
      ws.destroy();
      fs.existsSync(outPath) && fs.unlinkSync(outPath);
      reject(e);
    });
    ws.once("close", () => resolve());
    ws.once("error", reject);
  });
}

let done = 0;
const total = remaining.length;

async function worker(queue) {
  let tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  while (queue.length) {
    const job = queue.shift();
    const outPath = path.join(OUT_DIR, job.file);
    let attempts = 0;
    let lastErr = null;
    while (attempts < 3) {
      try {
        await synthOne(tts, job.text, outPath);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        attempts++;
        try { tts.close(); } catch {}
        tts = new MsEdgeTTS();
        await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      }
    }
    if (lastErr) {
      console.error(`FAILED ${job.file}:`, lastErr.message);
    } else {
      done++;
      if (done % 20 === 0 || done === total) {
        console.log(`progress: ${done}/${total}`);
      }
    }
  }
  try { tts.close(); } catch {}
}

(async () => {
  const queue = remaining.slice();
  const CONCURRENCY = 5;
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker(queue));
  await Promise.all(workers);
  console.log(`done. ${done}/${total} generated this run.`);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
