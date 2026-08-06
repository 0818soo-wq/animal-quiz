const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const SAMPLE_TEXT = "나는 누구일까요? 맞춰보세요! 나는 갈색 몸에 검은 줄무늬가 있어요. 나는 정글의 왕이라고 불려요.";

async function makeSample(voiceName, outFile) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioFilePath } = await tts.toFile(__dirname, SAMPLE_TEXT);
  const fs = require("fs");
  fs.renameSync(audioFilePath, require("path").join(__dirname, outFile));
  console.log(`saved ${outFile}`);
}

async function listKoVoices() {
  const tts = new MsEdgeTTS();
  const voices = await tts.getVoices();
  return voices.filter(v => v.Locale.startsWith("ko-"));
}

(async () => {
  const koVoices = await listKoVoices();
  console.log("ko-KR voices:", koVoices.map(v => `${v.ShortName} (${v.Gender})`).join(", "));

  await makeSample("ko-KR-SunHiNeural", "sample-sunhi.mp3");
  await makeSample("ko-KR-JiMinNeural", "sample-jimin.mp3");
})().catch(e => { console.error(e); process.exit(1); });
