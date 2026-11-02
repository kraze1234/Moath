// نموذج المشروع: القصة تتحول إلى مشاهد، وكل مشهد تعليمات يرسمها محرك Remotion.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const GROUND_Y = 1380; // خط الأرض في المشهد

export const BACKGROUNDS = {
  desertRoad: "طريق صحراوي",
  village: "قرية قديمة",
  mosque: "مسجد صغير في القرية",
  bedroom: "غرفة مظلمة",
  door: "باب قديم",
  windowView: "منظر من النافذة",
  nightSky: "سماء الليل",
} as const;
export type BackgroundId = keyof typeof BACKGROUNDS;

export const CHARACTERS = {
  hero: "البطل (شاب بثوب وشماغ)",
  elder: "شيخ كبير",
  child: "طفل",
  villager: "قروي",
  mother: "طيف الأم",
  figure: "شخص غامض",
  double: "نسخة البطل المظلمة",
} as const;
export type CharacterId = keyof typeof CHARACTERS;

export const ACTIONS = {
  idle: "وقوف",
  walk: "مشي",
  run: "ركض",
  turn: "التفات",
  sit: "جلوس",
  look: "ينظر",
  talk: "يتكلم",
  scared: "خائف يرتجف",
  openDoor: "يفتح الباب",
  phone: "يرد على الهاتف",
  drive: "يقود السيارة",
  carStop: "السيارة تتعطل",
  freeze: "متجمد بلا حركة",
  float: "يطفو (طيف)",
} as const;
export type ActionId = keyof typeof ACTIONS;

export const EXPRESSIONS = {
  neutral: "عادي",
  scared: "خائف",
  smile: "مبتسم",
  blank: "بلا ملامح",
} as const;
export type ExpressionId = keyof typeof EXPRESSIONS;

export const CAMERAS = {
  static: "ثابتة",
  zoomIn: "تقريب",
  zoomOut: "إبعاد",
  panLeft: "تحريك لليسار",
  panRight: "تحريك لليمين",
  shake: "اهتزاز",
} as const;
export type CameraId = keyof typeof CAMERAS;

export const LIGHTS = {
  normal: "عادية",
  dark: "مظلمة",
  flicker: "وميض الأنوار",
  off: "انطفاء الأنوار",
} as const;
export type LightId = keyof typeof LIGHTS;

export const PROPS = {
  car: "سيارة",
  clock: "ساعة حائط",
  phone: "هاتف",
  lamp: "مصباح",
  bench: "مقعد",
  windowShadow: "ظل في النافذة",
  eyes: "عيون في الظلام",
  smoke: "دخان",
} as const;
export type PropId = keyof typeof PROPS;

export const SFX = {
  wind: "رياح",
  drone: "همهمة مرعبة",
  heartbeat: "نبض قلب",
  knock: "طرق باب",
  creak: "صرير باب",
  ring: "رنين هاتف",
  engine: "تعطل محرك",
  sting: "ضربة رعب",
  whisper: "همس",
  footsteps: "خطوات",
  crickets: "صراصير الليل",
} as const;
export type SfxId = keyof typeof SFX;

export type Actor = {
  id: string;
  character: CharacterId;
  action: ActionId;
  x0: number;          // موضع البداية (0..1080)
  x1: number;          // موضع النهاية (للمشي والركض والقيادة)
  facing: "left" | "right" | "back";
  expression: ExpressionId;
  scale: number;
};

export type PropItem = {
  id: string;
  kind: PropId;
  x: number;
  y: number;
  scale: number;
  state: string;       // الساعة: "3:00" — الهاتف: "ringing" — المصباح: "on"/"off" — السيارة: "moving"/"broken"
};

export type Clip = { url: string; duration: number };

export type Scene = {
  id: string;
  text: string;                          // نص الراوي = الترجمة
  dialogue: { speaker: string; line: string; whisper: boolean } | null;
  background: BackgroundId;
  villageLit: boolean;                   // نوافذ القرية مضيئة
  duration: number;                      // بالثواني
  autoDuration: boolean;                 // تُحسب المدة من النص أو الصوت
  camera: CameraId;
  light: LightId;
  actors: Actor[];
  props: PropItem[];
  sfx: SfxId[];
  narration: Clip | null;                // صوت الراوي لهذا المشهد
};

export type Project = {
  title: string;
  story: string;
  scenes: Scene[];
  ambience: SfxId | null;                // صوت خلفية على طول الفيديو
  ambienceVolume: number;
};

export const uid = () => Math.random().toString(36).slice(2, 9);
