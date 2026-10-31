"""يقص التعليق الصوتي إلى جمل، ويرتّبها على خط زمني، ثم يكتب:
- voice-cut.mp3: الصوت الجديد، كل جملة متصلة وفي موضع ظهورها، والصمت بين الجمل محذوف
- timeline.js: مواضع الجمل والكلمات والانتقالات لتقرأها index.html
"""
import json, subprocess

SRC = "voice.mp3"

# الجملة: (المعرّف، مقاطعها في الأصل [(بداية، نهاية)...]، عدد حروف كل كلمة)
# «مَعًا» في c3 كانت ملتصقة بآخر «وَاحْتِرَامًا» في الأصل، فتُقص من هناك وتُوضع قبل «نُوَاجِهُ العُنْفَ».
# و«العُنْفُ» في c9a كانت ملتصقة بآخر «دَعْمُ الضَّحَايَا»، فتُقص وتُوضع قبل «لَا يَبْنِي مُجْتَمَعَاتٍ».
# الرقم الأخير (اختياري): الوقفة بين مقاطع الجملة.
PHRASES = [
    ("c0", [(0.00, 0.42)], [5]),                  # الرِّفْق
    ("c1", [(0.42, 1.86)], [3, 6]),               # مَعًا لِمُجْتَمَعٍ
    ("c2", [(2.03, 4.51)], [4, 5, 8]),            # أَكْثَرَ أَمَانًا وَاحْتِرَامًا
    ("c3", [(4.51, 4.90), (5.22, 6.34)], [3, 5, 5], 0.28),  # مَعًا .. نُوَاجِهُ العُنْفَ
    ("c4", [(6.49, 8.51)], [3, 4, 5, 5]),         # رَفْضُ جَمِيعِ أَشْكَالِ العُنْفِ
    ("c5", [(8.72, 10.06)], [5, 6]),              # حِمَايَةُ الحُقُوقِ
    ("c6", [(10.29, 11.57)], [5, 5]),             # تَعْزِيزُ الوَعْيِ
    ("c7", [(11.80, 13.11)], [5, 7]),             # تَعْزِيزُ العَدَالَةِ
    ("c8", [(13.31, 14.27)], [3, 7]),             # دَعْمُ الضَّحَايَا
    ("c9a", [(14.27, 14.93), (15.19, 16.84)], [5, 2, 4, 7], 0.06),      # العُنْفُ لَا يَبْنِي مُجْتَمَعَاتٍ
    ("c9b", [(17.19, 18.73)], [2, 4, 7]),         # بَلْ يَهْدِمُ الأَحْلَامَ
]
PHRASE_GAP = 0.25    # فاصل بين الجمل
MERGE = 0.62         # مدة الدمج حتى تظهر الصفحة الجديدة
CREDIT = 4.0         # مدة صفحة التحية


def main():
    clips, phrases, words, tr = [], {}, {}, [None]
    t = 0.15
    for pid, parts, letters, *gap in PHRASES:
        gap = gap[0] if gap else 0
        if pid == "c3":       # بعد الصفحة الأولى
            tr.append(round(t - PHRASE_GAP + 0.1, 3)); t = tr[-1] + MERGE + 0.25
        if pid == "c9a":      # بعد العناصر الخمسة (مهلة لنبض القلب)
            tr.append(round(t - PHRASE_GAP + 0.5, 3)); t = tr[-1] + MERGE + 0.25
        start, placed = t, []
        for s, e in parts:
            clips.append((s, e, t)); placed.append((t, e - s))
            t += (e - s) + gap
        t -= gap
        phrases[pid] = [round(start, 3), round(t - start, 3)]

        # موضع ظهور كل كلمة: بنسبة حروفها من زمن النطق
        speech = sum(d for _, d in placed)
        total, acc, ws = sum(letters), 0, []
        for n in letters:
            off = speech * acc / total
            for ps, pd in placed:
                if off < pd - 0.08:
                    ws.append(round(ps + off, 3)); break
                off = max(0, off - pd)
            else:
                ws.append(round(placed[-1][0], 3))
            acc += n
        words[pid] = ws
        t += PHRASE_GAP
    tr.append(round(t - PHRASE_GAP + 0.35, 3))
    end = round(tr[-1] + MERGE + CREDIT, 2)

    with open("timeline.js", "w") as f:
        f.write("// يُولَّد من timeline.py — لا تعدّله يدويًا\n")
        f.write("const CL = %s;\n" % json.dumps(phrases))
        f.write("const WORDS = %s;\n" % json.dumps(words))
        f.write("const TR = %s;\nconst END = %s;\n" % (json.dumps(tr), end))

    fc, labels = [], []
    for k, (s, e, at) in enumerate(clips):
        d = e - s
        fc.append(f"[0:a]atrim={s}:{e},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,"
                  f"afade=t=out:st={max(0, d - 0.04):.3f}:d=0.04,adelay={int(at * 1000)}[a{k}]")
        labels.append(f"[a{k}]")
    fc = ";".join(fc) + f";anullsrc=r=44100:cl=mono,atrim=0:{end}[sil];[sil]{''.join(labels)}" \
         f"amix=inputs={len(clips) + 1}:normalize=0:duration=first[out]"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", SRC, "-filter_complex", fc, "-map", "[out]",
                    "-t", str(end), "-c:a", "libmp3lame", "-b:a", "192k", "voice-cut.mp3"], check=True)
    for pid, (s, d) in phrases.items():
        print(pid, s, d, words[pid])
    print("TR", tr, "END", end)


main()
