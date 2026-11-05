"""يبني الخط الزمني للفيديو (timeline.js).

بدون صوت: توقيت تقديري من طول كل جملة ووقفات ElevenLabs في النص.
مع الصوت: python3 timeline.py voice.mp3 words.json — words.json توقيت الكلمات من Whisper
([{"words": [{"s","e","w"}]}])، فيُضبط كل جزء على بداية أول كلماته ونهاية آخرها.
"""
import json, re, sys

# أجزاء الكلام بالترتيب، والوقفة بعد كل جزء كما في نص ElevenLabs
PARTS = [
    ("T",   "الاحْتِرَامُ", 1.0),
    ("P1",  "هُوَ أَحَدُ القِيَمِ الَّتِي يَتَمَتَّعُ بِهَا الشَّخْصُ الَّذِي يَمْتَلِكُ الأَخْلَاقَ وَالسُّلُوكَ الجَيِّدَ،", 0.3),
    ("P2",  "وَلَا تَكْتَمِلُ مَنْظُومَةُ القِيَمِ دُونَ تَوَافُرِ الاحْتِرَامِ فِي الشَّخْصِ،", 0.3),
    ("P3",  "فَالاحْتِرَامُ هُوَ إِظْهَارُ التَّقْدِيرِ لِلْآخَرِينَ بِجَمِيعِ الوَسَائِلِ لِكَسْبِ مَحَبَّتِهِمْ.", 1.5),
    ("W",   "أَشْكَالُ الاحْتِرَامِ", 1.0),
    ("I1",  "احْتِرَامُ اللهِ بِطَاعَتِهِ وَعَدَمِ مَعْصِيَتِهِ", 1.0),
    ("I2",  "احْتِرَامُ الوَالِدَيْنِ", 1.0),
    ("I3",  "احْتِرَامُ زَمِيلَاتِي", 1.0),
    ("I4",  "احْتِرَامُ الآخَرِينَ", 1.0),
    ("I5",  "احْتِرَامُ ذَاتِي", 1.0),
    ("I6",  "احْتِرَامُ مُعَلِّمَتِي", 1.0),
    ("I7",  "احْتِرَامُ ذَوِي الاحْتِيَاجَاتِ الخَاصَّةِ", 1.0),
    ("I8",  "احْتِرَامُ الحَيَوَانِ وَالرِّفْقُ بِهِ", 1.0),
    ("I9",  "احْتِرَامِي لِكِتَابِي", 1.0),
    ("I10", "احْتِرَامُ المَكَانِ", 1.0),
    ("I11", "احْتِرَامُ الوَقْتِ", 1.0),
    ("I12", "احْتِرَامُ الوَطَنِ", 1.5),
    ("C1",  "مَعَ تَحِيَّاتِ التَّوْجِيهِ الطُّلَّابِيِّ", 0.7),
    ("C2",  "ابْتِدَائِيَّةُ حَلِيمَةَ السَّعْدِيَّةِ", 0.0),   # يُنطق ولا يظهر
]
LEAD = 0.6          # قبل أول كلمة: ظهور «الاحترام» الكبير
MERGE = 0.62        # مدة الدمج حتى تظهر الصفحة التالية
TAIL = 1.6          # بعد آخر كلمة

plain = lambda s: re.sub(r"[ً-ْـ،.]", "", s)


def estimate():
    t, out = LEAD, {}
    for key, text, pause in PARTS:
        d = round(len(plain(text).replace(" ", "")) * 0.075 + 0.25, 2)
        out[key] = [round(t, 2), d]
        t += d + pause
    return out


def from_words(words_json):
    """يطابق كلمات كل جزء بالترتيب مع كلمات Whisper (بعدد الكلمات)."""
    W = [w for seg in json.load(open(words_json)) for w in seg["words"]]
    out, i = {}, 0
    for key, text, _ in PARTS:
        n = len(text.split())
        ws = W[i:i + n]
        i += n
        out[key] = [round(ws[0]["s"] + LEAD, 2), round(ws[-1]["e"] - ws[0]["s"], 2)]
    return out


def main():
    tl = from_words(sys.argv[2]) if len(sys.argv) > 2 else estimate()
    end_of = lambda k: tl[k][0] + tl[k][1]
    tr1 = round(end_of("P3") + 0.25, 2)
    tr2 = round(end_of("I12") + 0.3, 2)
    end = round(end_of("C2") + TAIL, 2)
    with open("timeline.js", "w") as f:
        f.write("// يُولَّد من timeline.py — لا تعدّله يدويًا\n")
        f.write("const TL = %s;\n" % json.dumps(tl))
        f.write("const TEXT = %s;\n" % json.dumps({k: t for k, t, _ in PARTS}, ensure_ascii=False))
        f.write("const TR = [null, %s, %s];\nconst MERGE = %s;\nconst END = %s;\nconst LEAD = %s;\n" % (tr1, tr2, MERGE, end, LEAD))
    print("TR", tr1, tr2, "END", end)


main()
