// المخرج: يحوّل القصة العربية إلى مشاهد.
// المسار المحلي (قواعد وكلمات مفتاحية) يعمل دون إنترنت؛ مسار الذكاء الاصطناعي (server/llm.ts)
// يُخرج نفس SceneSpec ثم يمر بنفس buildScene، فالرسم واحد في الحالتين.
import {
  ActionId, Actor, BackgroundId, CameraId, CharacterId, ExpressionId, LightId, Project, PropId,
  PropItem, Scene, SfxId, GROUND_Y, uid,
} from "./types";

export type Position = "left" | "center" | "right" | "offLeft" | "offRight";

export type ActorSpec = {
  character: CharacterId;
  action: ActionId;
  position: Position;
  moveTo: Position | null;
  facing: "left" | "right" | "back";
  expression: ExpressionId;
};

export type SceneSpec = {
  text: string;
  dialogue: { speaker: string; line: string; whisper: boolean } | null;
  background: BackgroundId;
  villageLit: boolean;
  camera: CameraId;
  light: LightId;
  actors: ActorSpec[];
  props: { kind: PropId; state: string | null }[];
  sfx: SfxId[];
};

const POS: Record<Position, number> = { offLeft: -160, left: 270, center: 540, right: 810, offRight: 1240 };

// أماكن ثابتة للأشياء في كل خلفية
const PROP_PLACE: Record<PropId, (bg: BackgroundId) => { x: number; y: number; scale: number }> = {
  car: () => ({ x: 330, y: GROUND_Y + 40, scale: 1 }),
  clock: (bg) => (bg === "bedroom" ? { x: 300, y: 760, scale: 1 } : { x: 540, y: 820, scale: 1.6 }),
  phone: () => ({ x: 780, y: GROUND_Y - 150, scale: 1 }),
  lamp: () => ({ x: 860, y: 640, scale: 1 }),
  bench: () => ({ x: 300, y: GROUND_Y, scale: 1 }),
  windowShadow: () => ({ x: 760, y: 900, scale: 1 }),
  eyes: () => ({ x: 540, y: 1000, scale: 1 }),
  smoke: () => ({ x: 640, y: GROUND_Y - 120, scale: 1 }),
};

const DEFAULT_STATE: Partial<Record<PropId, string>> = { clock: "3:00", phone: "ringing", lamp: "on", car: "parked" };

export function buildScene(spec: SceneSpec): Scene {
  const actors: Actor[] = spec.actors.map((a, i) => {
    const x0 = POS[a.position] + (a.position === "center" && i > 0 ? i * 40 : 0);
    const big = spec.background === "windowView" ? 0.62 : a.character === "child" ? 0.75 : 1;
    return {
      id: uid(), character: a.character, action: a.action, x0, x1: a.moveTo ? POS[a.moveTo] : x0,
      facing: a.facing, expression: a.expression, scale: big,
    };
  });
  const props: PropItem[] = spec.props.map((p) => ({
    id: uid(), kind: p.kind, ...PROP_PLACE[p.kind](spec.background), state: p.state ?? DEFAULT_STATE[p.kind] ?? "",
  }));
  return {
    id: uid(), text: spec.text, dialogue: spec.dialogue, background: spec.background, villageLit: spec.villageLit,
    duration: 5, autoDuration: true, camera: spec.camera, light: spec.light, actors, props, sfx: spec.sfx, narration: null,
  };
}

// ——— المخرج المحلي ———

const has = (s: string, re: RegExp) => re.test(s);
const NAMES = ["فهد", "محمد", "عبدالله", "خالد", "سعد", "ناصر", "سلطان", "فيصل", "تركي", "بندر", "عمر", "علي", "أحمد", "سالم", "ماجد", "نواف"];

function splitSentences(story: string): string[] {
  // الاقتباسات لا تُقسم: تُستبدل مؤقتًا ثم تُعاد
  const quotes: string[] = [];
  const parts = story
    .replace(/\r/g, "")
    .replace(/[«"“][^»"”]*[»"”]/g, (q) => `\u0000${quotes.push(q) - 1}\u0000`)
    .split(/(?<=[.!؟?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .map((s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => quotes[+i]));
  // دمج الجمل القصيرة جدًا مع ما قبلها
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && p.split(/\s+/).length < 3) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  return out;
}

function findHeroName(story: string): string {
  const m = story.match(/(?:اسمه|يُدعى|يدعى)\s+([ء-ي]+)/);
  if (m) return m[1];
  for (const n of NAMES) if (story.includes(n)) return n;
  return "البطل";
}

function extractDialogue(s: string, heroName: string, elderPresent: boolean) {
  const m = s.match(/[«"“](.+?)[»"”]/);
  if (!m) return null;
  const before = s.slice(0, m.index);
  const whisper = has(before, /همس|يهمس|صوت/);
  let speaker = heroName;
  if (has(before, /صوت/)) speaker = "صوت مجهول";
  else if (elderPresent || has(before, /الشيخ|العجوز/)) speaker = "الشيخ";
  return { speaker, line: m[1].trim(), whisper };
}

export function directStory(story: string, title = "قصة رعب"): Project {
  const hero = findHeroName(story);
  const sentences = splitSentences(story);
  let place: BackgroundId = "desertRoad";
  let inside = false;
  let carBroken = false;
  const specs: SceneSpec[] = [];

  sentences.forEach((full, idx) => {
    // الكلمات المفتاحية تُقرأ من السرد فقط، لا من داخل الاقتباس
    const s = full.replace(/[«"“][^»"”]*[»"”]/g, " ");
    // المكان: يستمر حتى يتغير
    const phoneCall = has(s, /اتصال|مكالمة|هاتف|جوال|يرن|رن /);
    const clock = has(s, /الساعة|ساعته|ساعة/);
    if (has(s, /النافذة|نافذة|الشباك|شباك|يطل/)) place = "windowView";
    else if (has(s, /فتح الباب|يفتح الباب|طرق الباب|الباب/) && inside && !has(s, /لا تفتح/)) place = "door";
    else if (has(s, /غرفة|غرفته|سرير|ينام|نام|البيت|المنزل|بيت/) || ((phoneCall || clock) && inside)) { place = "bedroom"; inside = true; }
    else if (has(s, /مسجد|جامع|مئذنة/)) place = "mosque";
    else if (has(s, /قرية|القرية|بيوت|الأهالي/) && !inside) place = has(s, /مشى|دخل|يدخل|وصل/) ? "village" : place === "desertRoad" ? "desertRoad" : "village";
    else if (has(s, /صحراء|الطريق|طريق|سيارة|يقود|يسوق/) && !inside) place = "desertRoad";
    if (place === "windowView" || place === "door") inside = true;
    if ((phoneCall || clock) && inside && place !== "bedroom") place = "bedroom";

    const actors: ActorSpec[] = [];
    const props: SceneSpec["props"] = [];
    const sfx: SfxId[] = [];
    let camera: CameraId = idx === 0 ? "zoomOut" : "zoomIn";
    let light: LightId = inside ? "dark" : "normal";
    const sudden = has(s, /فجأة|فجاة/);
    const elder = has(s, /شيخ|عجوز|مسن|رجل كبير/);
    const villagers = has(s, /أهل القرية|القرويين|سكان|الأهالي|الناس/);
    const mother = has(s, /أمه|والدته|أمي|أم /);
    const double = has(s, /يشبه صوته|مثل صوته|نسخة منه|صوته تمامًا/);
    const dialogue = extractDialogue(full, hero, elder);

    // فعل البطل
    let heroAction: ActionId = "idle";
    let heroExpr: ExpressionId = "neutral";
    let from: Position = "center";
    let to: Position | null = null;
    let facing: "left" | "right" | "back" = "left";
    const carScene = place === "desertRoad" && has(s, /سيارة|سيارته|يقود|يسوق|تعطل/);

    if (carScene && has(s, /تعطل|توقف|خرب/)) { heroAction = "carStop"; carBroken = true; sfx.push("engine"); camera = "shake"; }
    else if (carScene) { heroAction = "drive"; from = "offRight"; to = "center"; camera = "panLeft"; }
    else if (has(s, /يركض|ركض|هرب|يهرب/)) { heroAction = "run"; from = "right"; to = "left"; camera = "panLeft"; sfx.push("footsteps"); }
    else if (has(s, /مشى|يمشي|دخل|يدخل|سار|اتجه|اقترب|ذهب|وصل/)) { heroAction = "walk"; from = "offRight"; to = elder ? "right" : "center"; camera = "panLeft"; sfx.push("footsteps"); }
    else if (place === "door" && has(s, /فتح|يفتح/)) { heroAction = "openDoor"; from = "right"; sfx.push("creak"); }
    else if (phoneCall) { heroAction = "phone"; heroExpr = "scared"; from = "left"; sfx.push("ring"); camera = "shake"; }
    else if (has(s, /التفت|استدار/)) { heroAction = "turn"; }
    else if (has(s, /خاف|رعب|ارتجف|تجمد|مرعوب|يسمع|سمع|تناديه|يناديه|همس|يهمس/)) { heroAction = "scared"; heroExpr = "scared"; sfx.push("heartbeat"); }
    else if (has(s, /لاحظ|رأى|شاهد|ينظر|نظر|يرى|وجد/)) { heroAction = "look"; }
    if (dialogue?.whisper) { heroExpr = "scared"; if (heroAction === "idle" || heroAction === "look") heroAction = "scared"; }

    // من يظهر في المشهد
    if (place === "windowView") {
      // من الداخل: البطل يظهر من ظهره أمام النافذة، والقرويون في الخارج
      if (villagers) ["left", "center", "right"].forEach((p) => actors.push({ character: "villager", action: "freeze", position: p as Position, moveTo: null, facing: "right", expression: "blank" }));
      if (mother) actors.push({ character: "mother", action: "float", position: "center", moveTo: null, facing: "left", expression: "blank" });
      sfx.push("drone");
      camera = "zoomIn";
    } else {
      if (heroAction !== "carStop" && heroAction !== "drive" || place === "desertRoad")
        actors.push({ character: "hero", action: heroAction, position: from, moveTo: to, facing, expression: heroExpr });
      if (elder) {
        const talking = !!dialogue || has(s, /حذر|قال|أخبر/);
        actors.push({ character: "elder", action: talking ? "talk" : has(s, /جالس|يجلس|جلس/) ? "sit" : "idle", position: "left", moveTo: null, facing: "right", expression: "neutral" });
        if (has(s, /جالس|يجلس|جلس/) || talking) props.push({ kind: "bench", state: null });
        if (talking) { const h = actors.find((a) => a.character === "hero"); if (h) { h.position = "right"; h.moveTo = null; h.action = h.action === "walk" ? "idle" : h.action; } camera = "static"; }
      }
      if (villagers && place !== "bedroom") ["left", "center"].forEach((p) => actors.push({ character: "villager", action: "freeze", position: p as Position, moveTo: null, facing: "right", expression: "blank" }));
      if (double) { actors.push({ character: "double", action: "freeze", position: "left", moveTo: null, facing: "right", expression: "blank" }); const h = actors.find((a) => a.character === "hero"); if (h) h.position = "right"; }
      if (mother && place === "bedroom") { props.push({ kind: "windowShadow", state: null }); sfx.push("whisper"); const h = actors.find((a) => a.character === "hero"); if (h) { h.position = "left"; h.facing = "right"; } }
      if (has(s, /طفل|ولد صغير|بنت صغيرة/)) actors.push({ character: "child", action: "idle", position: "left", moveTo: null, facing: "right", expression: "neutral" });
      if (has(s, /ظل|شبح|كائن|شخص غريب/)) actors.push({ character: "figure", action: "freeze", position: "left", moveTo: null, facing: "right", expression: "blank" });
    }

    // الأشياء
    if (place === "desertRoad") {
      const h = actors.find((a) => a.character === "hero");
      if (h && heroAction !== "drive" && heroAction !== "carStop") { h.position = "right"; h.facing = "left"; }
      props.push({ kind: "car", state: heroAction === "drive" ? "moving" : carBroken ? "broken" : "parked" });
      if (heroAction === "carStop") props.push({ kind: "smoke", state: null });
      sfx.push("wind");
    }
    if (clock) {
      const t = s.match(/(\d{1,2})[:٫](\d{2})/);
      const t3 = has(s, /الثالثة/) ? "3:00" : null;
      props.push({ kind: "clock", state: t ? `${t[1]}:${t[2]}` : t3 ?? "3:00" });
      camera = "zoomIn";
    }
    if (phoneCall && heroAction !== "phone") props.push({ kind: "phone", state: "ringing" });
    if (place === "bedroom") props.push({ kind: "lamp", state: has(s, /انطفأ|انطفأت|الظلام/) ? "off" : "on" });
    if (has(s, /عيون|عينين/)) props.push({ kind: "eyes", state: null });

    // الإضاءة والمؤثرات
    if (has(s, /انطفأ|انطفأت|الكهرباء/)) light = "off";
    else if (sudden && inside) light = "flicker";
    if (dialogue?.whisper) { light = "off"; sfx.push("whisper"); }
    if (sudden) { sfx.push("sting"); if (camera !== "panLeft") camera = "shake"; }
    if (has(s, /طرق|يطرق/)) sfx.push("knock");
    if (place === "village" || place === "mosque") sfx.push("crickets");
    const villageLit = has(s, /مضيئة|مضاءة|أنوار|منيرة|مضيئ/) || place === "village" || place === "mosque";
    if (has(s, /مضيئة|مضاءة|قرية/) && place === "desertRoad" && heroAction === "look") camera = "zoomIn";

    specs.push({
      text: full, dialogue, background: place, villageLit, camera, light, actors, props, sfx: [...new Set(sfx)],
    });
  });

  return { title, story, scenes: specs.map(buildScene), ambience: "wind", ambienceVolume: 0.25 };
}
