// تصدير MP4 حقيقي عبر Remotion: تجميع المشروع مرة واحدة ثم تصوير الإطارات وترميزها.
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { Project } from "../src/shared/types";

const ROOT = path.resolve(import.meta.dirname, "..");
export const OUT_DIR = path.join(ROOT, "data", "outputs");
fs.mkdirSync(OUT_DIR, { recursive: true });

// متصفح Remotion: يُستخدم المحدد في REMOTION_BROWSER، أو متصفح Playwright إن وُجد، وإلا يحمّله Remotion تلقائيًا
function browserExecutable(): string | null {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  const pw = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
  return fs.existsSync(pw) ? pw : null;
}

let bundled: Promise<string> | null = null;
export const getBundle = () =>
  (bundled ??= bundle({ entryPoint: path.join(ROOT, "src/remotion/index.ts"), publicDir: path.join(ROOT, "public") }));

export type Job = { id: string; status: "queued" | "rendering" | "done" | "error"; progress: number; file?: string; error?: string };
export const jobs = new Map<string, Job>();

export async function renderProject(project: Project, mediaOrigin: string, outFile: string, onProgress?: (p: number) => void) {
  const serveUrl = await getBundle();
  const inputProps = { project, absoluteMedia: mediaOrigin };
  const composition = await selectComposition({ serveUrl, id: "Story", inputProps, browserExecutable: browserExecutable() });
  await renderMedia({
    serveUrl, composition, inputProps, codec: "h264", outputLocation: outFile,
    browserExecutable: browserExecutable(), concurrency: Math.max(1, Math.min(4, (await import("node:os")).cpus().length)),
    audioCodec: "aac", pixelFormat: "yuv420p", crf: 20,
    onProgress: ({ progress }) => onProgress?.(progress),
  });
  return outFile;
}

export function startJob(project: Project, mediaOrigin: string): Job {
  const id = Date.now().toString(36);
  const job: Job = { id, status: "queued", progress: 0 };
  jobs.set(id, job);
  const file = path.join(OUT_DIR, `${id}.mp4`);
  job.status = "rendering";
  renderProject(project, mediaOrigin, file, (p) => (job.progress = p))
    .then(() => { job.status = "done"; job.progress = 1; job.file = `/media/outputs/${id}.mp4`; })
    .catch((e) => { job.status = "error"; job.error = String(e?.message ?? e); console.error(e); });
  return job;
}
