"""يبني الخط الزمني لفيديو «آداب السلوك الرقمي» من الصوت وتوقيت كلمات Whisper.

python3 timeline.py voice.mp3 words.json  →  timeline.js + voice-cut.mp3
كل جزء يبدأ عند أول صوت فعلي فيه (بدايات Whisper تشمل الصمت قبلها) وينتهي بنهاية آخر كلمة.
عند الانتقال بين الصفحات يُضاف صمت إذا كانت الوقفة أقصر مما يحتاجه الدمج.
"""
import json, subprocess, sys
import numpy as np

# الجزء: (المفتاح، [(رقم مقطع Whisper، أول كلمة، آخر كلمة+1)]) — None = كل كلمات المقطع
PARTS = [
    ("T",  [(0, None, None)]),   # آداب السلوك الرقمي في الفصل الافتراضي
    ("S1", [(1, None, None)]),   # أخلاقي الرقمية تعكس شخصيتي
    ("S2", [(2, None, None)]),   # التزم بالسلوك الرقمي الإيجابي…
    ("C1", [(3, None, None)]),   # سلوكيات يجب تجنبها
    ("A1", [(4, None, None)]), ("A2", [(5, None, None)]), ("A3", [(6, None, None)]),
    ("A4", [(7, None, None), (8, None, None)]), ("A5", [(9, None, None)]),
    ("C2", [(10, None, None)]),  # المشاركة أثناء الحصة
    ("B1", [(11, None, None)]), ("B2", [(12, None, None)]), ("B3", [(13, None, None)]),
    ("B4", [(14, None, None)]), ("B5", [(15, None, None)]),
    ("C3", [(16, None, None)]),  # الحضور والانضباط
    ("D1", [(17, None, None)]), ("D2", [(18, None, None)]), ("D3", [(19, None, None)]), ("D4", [(20, None, None)]),
    ("R0", [(21, 0, 2)]),        # تذكر دائمًا
    ("R1", [(21, 2, None), (22, None, None), (23, None, None)]),
    ("E1", [(24, None, None)]),  # مع تحيات التوجيه الطلابي
    ("E2", [(25, None, None)]),  # مدرسة ابتدائية حليمة السعدية
]
PAGE_END = ["S2", "A5", "B5", "D4", "R1"]   # بعدها دمج إلى الصفحة التالية
MERGE = 0.62        # مدة الدمج حتى تظهر الصفحة التالية
NEED = 1.3          # أقل وقفة لازمة عند الانتقال (قبل الدمج 0.2 + الدمج + مهلة)
LEAD = 0.5          # قبل أول كلمة
TAIL = 2.0          # بعد آخر كلمة


def main():
    audio, words_json = sys.argv[1:3]
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", audio, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    db = 20 * np.log10(np.sqrt(np.square(a[: len(a) // 160 * 160].reshape(-1, 160)).mean(1)) + 1e-9)
    segs = json.load(open(words_json))

    tl = {}
    for key, spans in PARTS:
        ws = [w for i, s, e in spans for w in segs[i]["words"][s:e]]
        k = int(ws[0]["s"] * 100)
        while k < len(db) - 3 and not (db[k:k + 3] > -35).all():
            k += 1
        tl[key] = [k / 100, ws[-1]["e"]]          # [بداية، نهاية] في الصوت الأصلي

    # صمت إضافي عند الانتقالات
    keys = [k for k, _ in PARTS]
    gaps = {}
    for k in PAGE_END:
        nxt = keys[keys.index(k) + 1]
        pause = tl[nxt][0] - tl[k][1]
        if pause < NEED:
            gaps[k] = round(NEED - pause, 2)
    shift, out = LEAD, {}
    for k in keys:
        s, e = tl[k]
        out[k] = [round(s + shift, 2), round(e - s, 2)]
        if k in gaps: shift += gaps[k]
    end_of = lambda k: out[k][0] + out[k][1]
    tr = [None] + [round(end_of(k) + 0.2, 2) for k in PAGE_END]
    end = round(end_of("E2") + TAIL, 2)

    # الصوت: قص عند نقاط الانتقال وإدراج الصمت، ثم تأخير LEAD
    f, pieces, prev = [], [], 0.0
    cuts = [(round(tl[k][1] + 0.1, 3), g) for k, g in gaps.items()]
    cuts.sort()
    for i, (t, g) in enumerate(cuts + [(None, 0)]):
        f.append(f"[0:a]{f'atrim={prev}:{t}' if t is not None else f'atrim=start={prev}'},asetpts=PTS-STARTPTS[p{i}]")
        pieces.append(f"[p{i}]")
        if g:
            f.append(f"anullsrc=r=44100:cl=mono,atrim=0:{g}[g{i}]")
            pieces.append(f"[g{i}]")
        prev = t
    f.append(f"{''.join(pieces)}concat=n={len(pieces)}:v=0:a=1,adelay={int(LEAD * 1000)},apad=whole_dur={end}[out]")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", audio, "-filter_complex", ";".join(f), "-map", "[out]",
                    "-ac", "1", "-ar", "44100", "-t", str(end), "-c:a", "libmp3lame", "-b:a", "192k", "voice-cut.mp3"], check=True)

    with open("timeline.js", "w") as fh:
        fh.write("// يُولَّد من timeline.py — لا تعدّله يدويًا\n")
        fh.write("const TL = %s;\n" % json.dumps(out))
        fh.write("const TR = %s;\nconst MERGE = %s;\nconst END = %s;\n" % (json.dumps(tr), MERGE, end))
    print("gaps", gaps, "TR", tr, "END", end)


main()
