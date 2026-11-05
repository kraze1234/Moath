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
GAP_AFTER = {"P3": 0.9, "I12": 0.9}   # صمت يُضاف بعد هذه الأجزاء ليتسع الدمج بين الصفحات

plain = lambda s: re.sub(r"[ً-ْـ،.]", "", s)


def estimate():
    t, out = LEAD, {}
    for key, text, pause in PARTS:
        d = round(len(plain(text).replace(" ", "")) * 0.075 + 0.25, 2)
        out[key] = [round(t, 2), d]
        t += d + pause
    return out


def from_words(audio, words_json):
    """كل مقطع من Whisper يقابل جزءًا من النص بالترتيب. البداية: أول صوت فعلي بعد بداية المقطع
    (بدايات Whisper تشمل الصمت قبلها)، والنهاية: نهاية آخر كلمة."""
    import subprocess, numpy as np
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", audio, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    hop = 160
    db = 20 * np.log10(np.sqrt(np.square(a[: len(a) // hop * hop].reshape(-1, hop)).mean(1)) + 1e-9)
    segs = json.load(open(words_json))
    if len(segs) != len(PARTS):
        raise SystemExit(f"عدد مقاطع التفريغ {len(segs)} لا يساوي عدد الأجزاء {len(PARTS)}")
    out = {}
    for (key, _, _), seg in zip(PARTS, segs):
        i = int(seg["words"][0]["s"] * 100)
        while i < len(db) - 3 and not (db[i:i + 3] > -35).all():
            i += 1
        s, e = i / 100, seg["words"][-1]["e"]
        out[key] = [round(s + LEAD, 2), round(max(0.3, e - s), 2)]
    return out


def cut_audio(audio, tl):
    """يضيف صمتًا بعد أجزاء GAP_AFTER (ويزيح ما بعدها في tl)، ويؤخر الصوت LEAD ثانية → voice-cut.mp3."""
    import subprocess
    keys = [k for k, _, _ in PARTS]
    cuts, shift = [], 0.0
    for k in keys:
        if k in GAP_AFTER:
            end = tl[k][0] + tl[k][1] - LEAD + 0.12      # نقطة القص في الصوت الأصلي
            cuts.append((round(end, 3), GAP_AFTER[k]))
    # إزاحة الأجزاء اللاحقة
    acc = 0.0
    for k in keys:
        tl[k][0] = round(tl[k][0] + acc, 2)
        if k in GAP_AFTER: acc += GAP_AFTER[k]
    pieces, prev, f = [], 0.0, []
    for i, (t, gap) in enumerate(cuts + [(None, 0)]):
        trim = f"atrim={prev}:{t}" if t is not None else f"atrim=start={prev}"
        f.append(f"[0:a]{trim},asetpts=PTS-STARTPTS[p{i}]")
        pieces.append(f"[p{i}]")
        if gap:
            f.append(f"anullsrc=r=44100:cl=mono,atrim=0:{gap}[g{i}]")
            pieces.append(f"[g{i}]")
        prev = t
    f.append(f"{''.join(pieces)}concat=n={len(pieces)}:v=0:a=1,adelay={int(LEAD * 1000)}[out]")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", audio, "-filter_complex", ";".join(f), "-map", "[out]",
                    "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", "voice-cut.mp3"], check=True)


def main():
    if len(sys.argv) > 2:
        tl = from_words(sys.argv[1], sys.argv[2])
        cut_audio(sys.argv[1], tl)
    else:
        tl = estimate()
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
