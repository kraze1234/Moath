// خادم الاستوديو: تحليل القصة، صوت الراوي، رفع الصوت، والتصدير إلى MP4.
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { directStory, buildScene } from "../src/shared/director";
import type { Project } from "../src/shared/types";
import { espeak, elevenlabs, hasEspeak, MEDIA_DIR, probeDuration } from "./tts";
import { directWithClaude, llmAvailable } from "./llm";
import { OUT_DIR, jobs, startJob, getBundle } from "./render";

const PORT = Number(process.env.PORT || 3001);
const app = express();
app.use(express.json({ limit: "20mb" }));
app.use("/media/outputs", express.static(OUT_DIR));
app.use("/media", express.static(MEDIA_DIR));

app.get("/api/health", async (_req, res) => {
  res.json({
    llm: llmAvailable(),
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    espeak: await hasEspeak(),
  });
});

app.post("/api/direct", async (req, res) => {
  const { story, title, engine } = req.body as { story: string; title?: string; engine: "rules" | "llm" };
  if (!story?.trim()) return res.status(400).json({ error: "القصة فارغة" });
  if (engine === "llm") {
    if (!llmAvailable()) return res.status(400).json({ error: "ضع ANTHROPIC_API_KEY لتفعيل المخرج بالذكاء الاصطناعي" });
    try {
      const out = await directWithClaude(story);
      const project: Project = { title: title || out.title, story, scenes: out.scenes.map(buildScene), ambience: "wind", ambienceVolume: 0.2, narrationOff: true,
        choices: /تفتح الباب|افتح الباب/.test(story) ? ["افتح الباب", "لا تفتح الباب"] : [] };
      return res.json({ project, engine: "llm" });
    } catch (e: any) {
      return res.status(502).json({ error: `فشل المخرج بالذكاء الاصطناعي: ${e?.message ?? e}` });
    }
  }
  res.json({ project: directStory(story, title || "قصة رعب"), engine: "rules" });
});

app.post("/api/tts", async (req, res) => {
  const { scenes, provider, voiceId } = req.body as { scenes: { id: string; text: string }[]; provider: "espeak" | "elevenlabs"; voiceId?: string };
  try {
    const out: Record<string, { url: string; duration: number }> = {};
    for (const s of scenes) {
      const id = `tts-${s.id}-${Date.now().toString(36)}`;
      out[s.id] = provider === "elevenlabs" ? await elevenlabs(s.text, id, voiceId || "") : await espeak(s.text, id);
    }
    res.json({ clips: out });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

const upload = multer({ dest: MEDIA_DIR, limits: { fileSize: 50 * 1024 * 1024 } });
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "لا يوجد ملف" });
  const ext = path.extname(req.file.originalname).toLowerCase() || ".mp3";
  const final = req.file.path + ext;
  fs.renameSync(req.file.path, final);
  try {
    res.json({ url: `/media/${path.basename(final)}`, duration: await probeDuration(final) });
  } catch {
    res.status(400).json({ error: "تعذّر قراءة الملف الصوتي" });
  }
});

app.post("/api/render", (req, res) => {
  const { project } = req.body as { project: Project };
  if (!project?.scenes?.length) return res.status(400).json({ error: "لا توجد مشاهد" });
  res.json(startJob(project, `http://localhost:${PORT}`));
});
app.get("/api/render/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "غير موجود" });
  res.json(job);
});

// الواجهة المبنية (npm run build) تُخدم من هنا أيضًا
const dist = path.resolve(import.meta.dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`الخادم يعمل على http://localhost:${PORT}`);
  getBundle().then(() => console.log("تجميع Remotion جاهز للتصدير")).catch((e) => console.error("فشل تجميع Remotion:", e));
});
