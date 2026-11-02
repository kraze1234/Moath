// المخرج بالذكاء الاصطناعي (اختياري): Claude يقرأ القصة ويُخرج مشاهد منظمة بنفس صيغة المخرج المحلي.
// يحتاج ANTHROPIC_API_KEY. لم يُختبر هنا لعدم توفر مفتاح؛ عند أي خطأ تعيد الواجهة المسار المحلي.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { ACTIONS, BACKGROUNDS, CAMERAS, CHARACTERS, EXPRESSIONS, LIGHTS, PROPS, SFX } from "../src/shared/types";
import type { SceneSpec } from "../src/shared/director";

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const Pos = z.enum(["left", "center", "right", "offLeft", "offRight"]);

const SceneSchema = z.object({
  text: z.string().describe("جملة الراوي لهذا المشهد بالعربية كما في القصة"),
  dialogue: z.object({ speaker: z.string(), line: z.string(), whisper: z.boolean() }).nullable(),
  background: z.enum(keys(BACKGROUNDS)),
  villageLit: z.boolean(),
  camera: z.enum(keys(CAMERAS)),
  light: z.enum(keys(LIGHTS)),
  actors: z.array(z.object({
    character: z.enum(keys(CHARACTERS)),
    action: z.enum(keys(ACTIONS)),
    position: Pos,
    moveTo: Pos.nullable(),
    facing: z.enum(["left", "right", "back"]),
    expression: z.enum(keys(EXPRESSIONS)),
  })),
  props: z.array(z.object({ kind: z.enum(keys(PROPS)), state: z.string().nullable() })),
  sfx: z.array(z.enum(keys(SFX))),
});
const StorySchema = z.object({ title: z.string(), scenes: z.array(SceneSchema) });

const list = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k} (${v})`).join("، ");

const SYSTEM = `أنت مخرج رسوم متحركة ثنائية الأبعاد بسيطة جدًا لقصص رعب سعودية قصيرة بصيغة عمودية.
قسّم القصة إلى مشاهد (مشهد لكل حدث، عادةً 8–12 مشهدًا)، واختر لكل مشهد من الأصول المتاحة فقط:
الخلفيات: ${list(BACKGROUNDS)}
الشخصيات: ${list(CHARACTERS)} — البطل هو hero دائمًا.
الحركات: ${list(ACTIONS)} — drive وcarStop للبطل داخل السيارة في desertRoad، وwalk/run تحتاج moveTo.
التعابير: ${list(EXPRESSIONS)}
الكاميرا: ${list(CAMERAS)}
الإضاءة: ${list(LIGHTS)}
الأشياء: ${list(PROPS)} — state للساعة مثل "3:00"، للهاتف "ringing"، للمصباح "on" أو "off"، للسيارة "moving" أو "broken".
المؤثرات: ${list(SFX)}
قواعد: في windowView تظهر الشخصيات الخارجية فقط (قرويون، أطياف). الحوار المقتبس يوضع في dialogue، والهمس whisper=true.
لا تخترع أحداثًا غير موجودة في القصة.`;

export const llmAvailable = () => !!process.env.ANTHROPIC_API_KEY;

export async function directWithClaude(story: string): Promise<{ title: string; scenes: SceneSpec[] }> {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: `القصة:\n${story}` }],
    output_config: { format: zodOutputFormat(StorySchema) },
  });
  if (res.stop_reason === "refusal") throw new Error("رفض النموذج معالجة القصة");
  if (!res.parsed_output) throw new Error("لم يُرجع النموذج مشاهد صالحة");
  return res.parsed_output as { title: string; scenes: SceneSpec[] };
}
