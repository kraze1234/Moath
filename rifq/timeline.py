"""يقسم التعليق الصوتي إلى كلمات، ويرتّبها على خط زمني، ثم يكتب:
- voice-cut.mp3: الصوت الجديد، كل كلمة في موضعها وبين الكلمات فاصل قصير
- timeline.js: مواضع الكلمات والجمل والانتقالات لتقرأها index.html

حدود الجمل مأخوذة من وقفات الصوت، وحدود الكلمات داخل الجملة هي أهدأ نقاط فيها.
"""
import json, math, struct, subprocess

SRC = "voice.mp3"
RATE = 16000

# الجملة: (المعرّف، بداية في الأصل، نهاية في الأصل، عدد حروف كل كلمة)
PHRASES = [
    ("c0", 0.00, 0.42, [5]),   # الرِّفْق
    ("c1", 0.42, 1.86, [3, 6]),   # مَعًا لِمُجْتَمَعٍ
    ("c2", 2.03, 4.94, [4, 5, 8]),   # أَكْثَرَ أَمَانًا وَاحْتِرَامًا
    ("c3", 5.22, 6.34, [3, 5, 5]),   # مَعًا .. نُوَاجِهُ العُنْفَ
    ("c4", 6.49, 8.51, [3, 4, 5, 5]),   # رَفْضُ جَمِيعِ أَشْكَالِ العُنْفِ
    ("c5", 8.72, 10.06, [5, 6]),  # حِمَايَةُ الحُقُوقِ
    ("c6", 10.29, 11.57, [5, 5]), # تَعْزِيزُ الوَعْيِ
    ("c7", 11.80, 13.11, [5, 7]), # تَعْزِيزُ العَدَالَةِ
    ("c8", 13.31, 14.93, [3, 7]), # دَعْمُ الضَّحَايَا
    ("c9a", 15.19, 16.84, [5, 2, 4, 7]),# العُنْفُ لَا يَبْنِي مُجْتَمَعَاتٍ
    ("c9b", 17.19, 18.73, [2, 4, 7]),# بَلْ يَهْدِمُ الأَحْلَامَ
]
WORD_GAP = 0.16      # فاصل بين الكلمات داخل الجملة
PHRASE_GAP = 0.32    # فاصل بين الجمل
MERGE = 0.62         # مدة الدمج حتى تظهر الصفحة الجديدة
CREDIT = 4.0         # مدة صفحة التحية


def envelope():
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", SRC, "-ac", "1", "-ar", str(RATE),
                          "-f", "s16le", "-"], capture_output=True, check=True).stdout
    a = struct.unpack("<%dh" % (len(raw) // 2), raw)
    hop = RATE // 100  # 10ms
    env = []
    for i in range(0, len(a), hop):
        seg = a[i:i + hop]
        r = math.sqrt(sum(x * x for x in seg) / len(seg)) if seg else 0
        env.append(20 * math.log10(r / 32768 + 1e-9))
    # تنعيم خفيف
    return [sum(env[max(0, i - 2):i + 3]) / len(env[max(0, i - 2):i + 3]) for i in range(len(env))]


def split_words(env, s, e, letters):
    """نقطة القص بين كل كلمتين: أهدأ نقطة قريبة من موضعها المتوقع حسب عدد الحروف."""
    n = len(letters)
    if n == 1:
        return [(s, e)]
    i0, i1 = int(s * 100), int(e * 100)
    # حدود الكلام الفعلي داخل المقطع (بدون الصمت في الطرفين)
    loud = [i for i in range(i0, i1) if env[i] > -38]
    a, b = (loud[0], loud[-1]) if loud else (i0, i1)
    total = sum(letters)
    cuts, acc = [], 0
    for k in range(n - 1):
        acc += letters[k]
        exp = a + (b - a) * acc / total
        lo = int(max(a + 8, exp - 8, (cuts[-1] + 12) if cuts else 0))
        hi = int(min(b - 8, exp + 8))
        best = min(range(lo, max(lo + 1, hi + 1)), key=lambda i: env[i] + 0.4 * abs(i - exp))
        cuts.append(best)
    edges = [s] + [c / 100 for c in cuts] + [e]
    return list(zip(edges[:-1], edges[1:]))


def main():
    env = envelope()
    words, phrases, tr = [], {}, [None]
    t = 0.15
    for pid, s, e, n in PHRASES:
        if pid == "c3":       # بعد الصفحة الأولى
            tr.append(round(t - PHRASE_GAP + 0.1, 3)); t = tr[-1] + MERGE + 0.25
        if pid == "c9a":      # بعد العناصر الخمسة (مهلة لنبض القلب)
            tr.append(round(t - PHRASE_GAP + 0.5, 3)); t = tr[-1] + MERGE + 0.25
        start = t
        for k, (ws, we) in enumerate(split_words(env, s, e, n)):
            words.append({"p": pid, "i": k, "src": [round(ws, 3), round(we, 3)], "at": round(t, 3)})
            t += (we - ws) + WORD_GAP
        t -= WORD_GAP
        phrases[pid] = [round(start, 3), round(t - start, 3)]
        t += PHRASE_GAP
    tr.append(round(t - PHRASE_GAP + 0.35, 3))
    end = round(tr[-1] + MERGE + CREDIT, 2)

    with open("timeline.js", "w") as f:
        f.write("// يُولَّد من timeline.py — لا تعدّله يدويًا\n")
        f.write("const CL = %s;\n" % json.dumps(phrases))
        f.write("const WORDS = %s;\n" % json.dumps({p: [[w["at"], round(w["src"][1] - w["src"][0], 3)]
                                                        for w in words if w["p"] == p] for p in phrases}))
        f.write("const TR = %s;\nconst END = %s;\n" % (json.dumps(tr), end))

    parts, labels = [], []
    for k, w in enumerate(words):
        ws, we = w["src"]; d = we - ws
        parts.append(f"[0:a]atrim={ws}:{we},asetpts=PTS-STARTPTS,afade=t=in:d=0.015,"
                     f"afade=t=out:st={max(0, d - 0.03):.3f}:d=0.03,adelay={int(w['at'] * 1000)}[w{k}]")
        labels.append(f"[w{k}]")
    fc = ";".join(parts) + f";anullsrc=r=44100:cl=mono,atrim=0:{end}[sil];[sil]{''.join(labels)}" \
         f"amix=inputs={len(words) + 1}:normalize=0:duration=first[out]"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", SRC, "-filter_complex", fc, "-map", "[out]",
                    "-t", str(end), "-c:a", "libmp3lame", "-b:a", "192k", "voice-cut.mp3"], check=True)
    for w in words:
        print(w["p"], w["i"], w["src"], "→", w["at"])
    print("TR", tr, "END", end)


main()
