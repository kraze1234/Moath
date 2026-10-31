#!/usr/bin/env bash
# يبني الصوت المقصوص ثم يصدّر الفيديو rifq.mp4
# الاستعمال: ./build.sh   (يحتاج ffmpeg وnode مع playwright)
set -euo pipefail
cd "$(dirname "$0")"

END=25.8
# المقطع: بداية_في_الأصل نهاية_في_الأصل موضعه_في_الفيديو
# (يجب أن تطابق CL في index.html)
CLIPS=(
  "0.00 1.86 0.80"    # مَعًا لِمُجْتَمَعٍ
  "2.03 4.94 2.86"    # أَكْثَرَ أَمَانًا وَاحْتِرَامًا
  "5.22 6.34 6.70"    # مَعًا .. نُوَاجِهُ العُنْفَ
  "6.49 8.51 8.00"    # رَفْضُ جَمِيعِ أَشْكَالِ العُنْفِ
  "8.72 10.06 10.20"  # حِمَايَةُ الحُقُوقِ
  "10.29 11.57 11.70" # تَعْزِيزُ الوَعْيِ
  "11.80 13.11 13.15" # تَعْزِيزُ العَدَالَةِ
  "13.31 14.93 14.65" # دَعْمُ الضَّحَايَا
  "15.19 16.84 17.35" # العُنْفُ لَا يَبْنِي مُجْتَمَعَاتٍ
  "17.19 18.73 19.20" # بَلْ يَهْدِمُ الأَحْلَامَ
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
f+="${mix}amix=inputs=${#CLIPS[@]}:normalize=0,apad,atrim=0:$END[out]"
ffmpeg -hide_banner -loglevel error -y -i voice.mp3 -filter_complex "$f" -map "[out]" -c:a libmp3lame -b:a 192k voice-cut.mp3

rm -rf .frames && mkdir .frames
node render.js "$PWD" "$END"
ffmpeg -hide_banner -loglevel error -y -framerate 30 -i .frames/f%04d.png -i voice-cut.mp3 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -t "$END" -movflags +faststart rifq.mp4
rm -rf .frames
echo "rifq.mp4 جاهز"
