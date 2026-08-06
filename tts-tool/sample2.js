const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const fs = require("fs");
const path = require("path");

const SAMPLE_TEXT = "나는 누구일까요? 맞춰보세요! 나는 갈색 몸에 검은 줄무늬가 있어요. 나는 정글의 왕이라고 불려요.";

async function makeSample(voiceName, outFile, options) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioFilePath } = await tts.toFile(__dirname, SAMPLE_TEXT, options);
  fs.renameSync(audioFilePath, path.join(__dirname, outFile));
  console.log(`saved ${outFile}`);
}

(async () => {
  await makeSample("ko-KR-SunHiNeural", "sample-sunhi-warm.mp3", { rate: "-8%", pitch: "+15Hz" });
})().catch(e => { console.error(e); process.exit(1); });
