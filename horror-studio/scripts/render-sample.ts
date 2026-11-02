// مثال كامل من الطرف إلى الطرف: قصة نصية ← المخرج المحلي ← صوت espeak (إن وُجد) ← MP4.
// تشغيل: npm run sample   (الناتج: data/outputs/sample.mp4)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import { directStory } from "../src/shared/director";
import { espeak, hasEspeak, MEDIA_DIR } from "../server/tts";
import { renderProject, OUT_DIR } from "../server/render";

const ROOT = path.resolve(import.meta.dirname, "..");
const story = fs.readFileSync(path.join(ROOT, "samples/fahad.txt"), "utf8");
const project = directStory(story, "القرية التي لا يأتيها الفجر");
const withVoice = !process.argv.includes("--no-voice") && (await hasEspeak());

if (withVoice) {
  for (const s of project.scenes) s.narration = await espeak(s.text.replace(/[«»]/g, ""), `sample-${s.id}`);
}
fs.writeFileSync(path.join(OUT_DIR, "sample.json"), JSON.stringify(project, null, 2));
console.log(`${project.scenes.length} مشاهد — صوت الراوي: ${withVoice ? "espeak-ng" : "بدون"}`);

// خادم مؤقت يقدّم ملفات الصوت للمتصفح أثناء التصوير
const app = express();
app.use("/media", express.static(MEDIA_DIR));
const server = http.createServer(app).listen(0);
const port = (server.address() as any).port;

const out = path.join(OUT_DIR, "sample.mp4");
let last = -1;
await renderProject(project, `http://localhost:${port}`, out, (p) => {
  const pct = Math.floor(p * 100);
  if (pct >= last + 10) { last = pct; console.log(`التصدير ${pct}%`); }
});
server.close();
console.log("تم:", out);
