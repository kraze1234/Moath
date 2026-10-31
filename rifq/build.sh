#!/usr/bin/env bash
# يبني الصوت المقصوص ثم يصدّر الفيديو rifq.mp4
# الاستعمال: ./build.sh   (يحتاج ffmpeg وnode مع playwright)
set -euo pipefail
cd "$(dirname "$0")"

END=24.5
# المقطع: بداية_في_الأصل نهاية_في_الأصل موضعه_في_الفيديو
# (يجب أن تطابق CL في index.html)
CLIPS=(
  "0.00 1.98 0.80"    # مَعًا لِمُجْتَمَعٍ
  "2.31 4.23 2.98"    # أَكْثَرَ أَمَانًا وَاحْتِرَامًا
  "4.61 6.25 5.85"    # مَعًا .. نُوَاجِهُ العُنْفَ
  "6.90 8.89 7.70"    # رَفْضُ جَمِيعِ أَشْكَالِ العُنْفِ
  "9.39 10.54 9.85"   # حِمَايَةُ الحُقُوقِ
  "11.00 11.97 11.15" # تَعْزِيزُ الوَعْيِ
  "12.44 13.65 12.30" # تَعْزِيزُ العَدَالَةِ
  "14.22 15.35 13.70" # دَعْمُ الضَّحَايَا
  "15.89 17.76 16.15" # العُنْفُ لَا يَبْنِي مُجْتَمَعَاتٍ
  "17.88 19.05 18.20" # بَلْ يَهْدِمُ الأَحْلَامَ
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
