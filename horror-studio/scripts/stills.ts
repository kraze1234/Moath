// يصوّر لقطة ثابتة من منتصف كل مشهد في لوحة واحدة للمراجعة السريعة
// تشغيل: npx tsx scripts/stills.ts <مجلد الناتج>
import fs from "node:fs";
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { directStory } from "../src/shared/director";
import { getBundle } from "../server/render";
import { sceneFrames, TITLE_SECONDS } from "../src/shared/timing";
import { FPS } from "../src/shared/types";

const ROOT = path.resolve(import.meta.dirname, "..");
const out = process.argv[2] || path.join(ROOT, "data", "stills");
fs.mkdirSync(out, { recursive: true });
const project = directStory(fs.readFileSync(path.join(ROOT, "samples/fahad.txt"), "utf8"), "القرية التي لا يأتيها الفجر");
const browserExecutable = process.env.REMOTION_BROWSER || "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const serveUrl = await getBundle();
const inputProps = { project, absoluteMedia: "" };
const composition = await selectComposition({ serveUrl, id: "Story", inputProps, browserExecutable });
let from = Math.round(TITLE_SECONDS * FPS);
for (const [i, s] of project.scenes.entries()) {
  const f = from + Math.floor(sceneFrames(s) * (i === 0 ? 0.45 : 0.6));
  await renderStill({ serveUrl, composition, inputProps, frame: f, output: path.join(out, `s${String(i).padStart(2, "0")}.png`), browserExecutable, scale: 0.4 });
  from += sceneFrames(s);
}
if (project.choices.length === 2) {
  await renderStill({ serveUrl, composition, inputProps, frame: composition.durationInFrames - 20, output: path.join(out, "zz-choices.png"), browserExecutable, scale: 0.4 });
}
console.log("done", out);
