import { FPS, Project, Scene } from "./types";

// مدة المشهد التلقائية: من صوت الراوي إن وُجد، وإلا من طول النص
export function autoDuration(s: Scene): number {
  if (s.narration) return Math.max(2.5, s.narration.duration + 0.8);
  const words = (s.text + " " + (s.dialogue?.line ?? "")).trim().split(/\s+/).filter(Boolean).length;
  return Math.min(10, Math.max(3.5, words * 0.42 + 1.4));
}

export const sceneSeconds = (s: Scene) => (s.autoDuration ? autoDuration(s) : s.duration);
export const sceneFrames = (s: Scene) => Math.max(15, Math.round(sceneSeconds(s) * FPS));

export const TITLE_SECONDS = 2.2;
export const CHOICE_SECONDS = 4.5;
export const hasChoices = (p: Project) => (p.choices ?? []).filter((c) => c.trim()).length === 2;

export function totalFrames(p: Project): number {
  return Math.round(TITLE_SECONDS * FPS) + p.scenes.reduce((n, s) => n + sceneFrames(s), 0) + (hasChoices(p) ? Math.round(CHOICE_SECONDS * FPS) : 0);
}

// يقسم الترجمة إلى أسطر قصيرة توزَّع على زمن النطق
export function subtitleChunks(text: string, maxWords = 6): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) out.push(words.slice(i, i + maxWords).join(" "));
  return out;
}
