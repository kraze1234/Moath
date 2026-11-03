"""ينظف تسجيل الراوي: يكتم أصوات الفم والمضغ (ومضات قصيرة خارج الكلمات) ويخفض الأنفاس 8dB، ثم يوحّد مستوى الصوت.
تشغيل: python3 scripts/clean-voice.py <التسجيل> <الناتج.wav> <تقرير.json> <كلمات.json>
كلمات.json: توقيت الكلمات من Whisper ([{"words": [{"s","e","w"}]}]) — يمنع كتم حروف مثل ق وك داخل الكلمات.
"""
import sys, json, subprocess, numpy as np
src, out, report, words_json = sys.argv[1:5]
SR = 48000
raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
a = np.frombuffer(raw, dtype=np.float32).copy()
hop = SR // 100  # 10ms
n = len(a) // hop
db = np.array([20 * np.log10(np.sqrt((a[i*hop:(i+1)*hop] ** 2).mean()) + 1e-9) for i in range(n)])

SPEECH, MERGE, MIN_SPEECH = -36.0, 15, 8   # عتبة الكلام، دمج الفجوات <150ms، أقل كلام 80ms
loud = db >= SPEECH
# جزر متصلة
def runs(mask):
    r, i = [], 0
    while i < len(mask):
        if mask[i]:
            j = i
            while j < len(mask) and mask[j]: j += 1
            r.append([i, j]); i = j
        else: i += 1
    return r
isl = runs(loud)
# نقرة فم/مضغة: ومضة قصيرة (≤90ms، قد تكون نبضتين متقاربتين) يسبقها هدوء ≥60ms،
# ويهبط الصوت بعدها 8dB على الأقل — حتى لو بدأ كلام بعدها مباشرة
quiet = db < -40
cl = []
for s, e in runs(db >= -40):
    if cl and s - cl[-1][1] <= 3: cl[-1][1] = e
    else: cl.append([s, e])
def is_click(s, e):
    if e - s > 9 or s < 6 or not quiet[s-6:s].all() or e + 3 > n: return False
    peak = db[s:e].max()
    return peak >= -34 and db[e:e+3].max() <= peak - 8
# لا تُكتم أي ومضة داخل كلمة (حروف مثل ق وك وت تنفجر بنفس الشكل): مدى الكلمة من بداية صوتها إلى نهايتها في التفريغ
inword = np.zeros(n, bool)
for seg in json.load(open(words_json)):
    for w in seg["words"]:
        s0 = int(w["s"] * 100)
        while s0 < n - 1 and db[s0] < SPEECH: s0 += 1          # بداية التفريغ تشمل الصمت قبل الكلمة
        inword[max(0, s0 - 3):min(n, int(w["e"] * 100) + 1)] = True
lipclicks = [(s, e) for s, e in cl if is_click(s, e) and not inword[s:e].any()]
for s, e in lipclicks: loud[s:e] = False
isl = runs(loud)
# دمج الجزر القريبة لتكوين مقاطع كلام
merged = []
for s, e in isl:
    if merged and s - merged[-1][1] < MERGE: merged[-1][1] = e
    else: merged.append([s, e])
speech, clicks = [], []
for s, e in merged:
    (speech if e - s >= MIN_SPEECH else clicks).append((s, e))

gain = np.ones(n)
# هامش حول الكلام حتى لا تُقص بدايات الحروف ونهاياتها
inspeech = np.zeros(n, bool)
for s, e in speech: inspeech[max(0, s-6):min(n, e+8)] = True
breath = 0
for i in range(n):
    if inspeech[i]: continue
    if db[i] > -52: gain[i] = 10 ** (-8 / 20); breath += 1      # نفس/همهمة: أخفض 8dB
for s, e in lipclicks: gain[max(0, s-2):min(n, e+2)] = 10 ** (-40 / 20)
for s, e in clicks:                                              # نقرة فم: كتم شبه كامل
    if not inspeech[s:e].any() and not inword[s:e].any(): gain[max(0, s-2):min(n, e+3)] = 10 ** (-40 / 20)
# تنعيم منحنى الكسب (لا قفزات)
g = np.repeat(gain, hop)
g = np.concatenate([g, np.full(len(a) - len(g), g[-1])])
k = np.hanning(int(SR * 0.012)); k /= k.sum()
g = np.convolve(g, k, mode="same")
y = (a * g).astype(np.float32)
tmp = out + ".f32"
y.tofile(tmp)
# مزيل نقرات خفيف + قص الترددات المنخفضة جدًا + توحيد مستوى الصوت
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", tmp,
                "-af", "highpass=f=70,adeclick=w=40:o=75:t=3,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", out], check=True)
import os; os.remove(tmp)
json.dump({"clicks_muted": sorted([(round(s/100, 2), round(e/100, 2)) for s, e in clicks if not inspeech[s:e].any() and not inword[s:e].any()] + [(round(s/100, 2), round(e/100, 2)) for s, e in lipclicks]),
           "breath_seconds_lowered": breath / 100, "speech_segments": len(speech)}, open(report, "w"), indent=1)
print(open(report).read())
