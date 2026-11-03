// مثال كامل من الطرف إلى الطرف: قصة نصية ← المخرج المحلي ← MP4 بالمؤثرات (وصوت راوٍ espeak مع --voice).
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
// صوت الراوي: تسجيل حقيقي منظّف إن وُجد في samples/narration (مع توقيت كل مشهد وكل سطر)،
// أو espeak-ng مع --voice، وإلا بلا راوٍ (المؤثرات موجودة دائمًا)
const NAR = path.join(ROOT, "samples/narration");
const recorded = fs.existsSync(path.join(NAR, "voice.m4a")) && !process.argv.includes("--no-recording");
const withVoice = !recorded && process.argv.includes("--voice") && (await hasEspeak());
project.narrationOff = !recorded && !withVoice;
if (recorded) {
  const al = JSON.parse(fs.readFileSync(path.join(NAR, "alignment.json"), "utf8"));
  if (al.scenes.length !== project.scenes.length) throw new Error("عدد المشاهد لا يطابق alignment.json");
  project.scenes.forEach((s, i) => {
    const a = al.scenes[i];
    Object.assign(s, { duration: a.duration, autoDuration: false, cues: a.cues, dialogueAt: a.dialogueAt });
  });
  Object.assign(project, { choicesSeconds: al.choicesSeconds, choicesPrompt: al.choicesPrompt });
  fs.copyFileSync(path.join(NAR, "voice.m4a"), path.join(MEDIA_DIR, "sample-voice.m4a"));
  project.voiceTrack = { url: "/media/sample-voice.m4a", duration: 0 };
}

if (withVoice) {
  for (const s of project.scenes) s.narration = await espeak(s.text.replace(/[«»]/g, ""), `sample-${s.id}`);
}
fs.writeFileSync(path.join(OUT_DIR, "sample.json"), JSON.stringify(project, null, 2));
console.log(`${project.scenes.length} مشاهد — صوت الراوي: ${recorded ? "تسجيل samples/narration" : withVoice ? "espeak-ng" : "بدون"}`);

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
