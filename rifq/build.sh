#!/usr/bin/env bash
# يبني الصوت المقصوص ثم يصدّر الفيديو rifq.mp4
# الاستعمال: ./build.sh   (يحتاج ffmpeg وnode مع playwright)
set -euo pipefail
cd "$(dirname "$0")"

END=25.5
# المقطع: بداية_في_الأصل نهاية_في_الأصل موضعه_في_الفيديو
# (يجب أن تطابق CL في index.html)
CLIPS=(
  "0.00 0.42 0.15"    # الرِّفْق
  "0.42 1.86 0.90"    # مَعًا لِمُجْتَمَعٍ
  "2.03 4.94 2.55"    # أَكْثَرَ أَمَانًا وَاحْتِرَامًا
  "5.22 6.34 6.40"    # مَعًا .. نُوَاجِهُ العُنْفَ
  "6.49 8.51 7.70"    # رَفْضُ جَمِيعِ أَشْكَالِ العُنْفِ
  "8.72 10.06 9.90"   # حِمَايَةُ الحُقُوقِ
  "10.29 11.57 11.40" # تَعْزِيزُ الوَعْيِ
  "11.80 13.11 12.85" # تَعْزِيزُ العَدَالَةِ
  "13.31 14.93 14.35" # دَعْمُ الضَّحَايَا
  "15.19 16.84 17.05" # العُنْفُ لَا يَبْنِي مُجْتَمَعَاتٍ
  "17.19 18.73 18.90" # بَلْ يَهْدِمُ الأَحْلَامَ
)

f="" ; mix=""
for i in "${!CLIPS[@]}"; do
  read -r s e at <<<"${CLIPS[$i]}"
  d=$(awk "BEGIN{print $e-$s}")
  fo=$(awk "BEGIN{print $d-0.04}")
  ms=$(awk "BEGIN{printf \"%d\", $at*1000}")
  f+="[0:a]atrim=$s:$e,asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=$fo:d=0.04,adelay=$ms[a$i];"
  mix+="[a$i]"
done
f+="anullsrc=r=44100:cl=mono,atrim=0:$END[sil];[sil]${mix}amix=inputs=$((${#CLIPS[@]}+1)):normalize=0:duration=first[out]"
ffmpeg -hide_banner -loglevel error -y -i voice.mp3 -filter_complex "$f" -map "[out]" -t "$END" -c:a libmp3lame -b:a 192k voice-cut.mp3

rm -rf .frames && mkdir .frames
node render.js "$PWD" "$END"
ffmpeg -hide_banner -loglevel error -y -framerate 30 -i .frames/f%04d.png -i voice-cut.mp3 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -t "$END" -movflags +faststart rifq.mp4
rm -rf .frames
echo "rifq.mp4 جاهز"
