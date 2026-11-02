// صوت الراوي: espeak-ng محلي مجاني (صوت آلي)، أو ElevenLabs إن وُضع مفتاحه (صوت طبيعي).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
export const MEDIA_DIR = path.join(ROOT, "data", "media");
fs.mkdirSync(MEDIA_DIR, { recursive: true });

export async function hasEspeak(): Promise<boolean> {
  try { await run("espeak-ng", ["--version"]); return true; } catch { return false; }
}

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(stdout.trim());
}

export async function espeak(text: string, id: string): Promise<{ url: string; duration: number }> {
  const file = path.join(MEDIA_DIR, `${id}.wav`);
  // صوت عربي ذكوري أبطأ قليلًا وأعمق
  await run("espeak-ng", ["-v", "ar", "-s", "135", "-p", "35", "-w", file, text]);
  return { url: `/media/${id}.wav`, duration: await probeDuration(file) };
}

// ElevenLabs: يحتاج ELEVENLABS_API_KEY. لم يُختبر هنا لعدم توفر مفتاح.
export async function elevenlabs(text: string, id: string, voiceId: string): Promise<{ url: string; duration: number }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY غير موجود");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) throw new Error(`ElevenLabs: ${res.status} ${await res.text()}`);
  const file = path.join(MEDIA_DIR, `${id}.mp3`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return { url: `/media/${id}.mp3`, duration: await probeDuration(file) };
}
