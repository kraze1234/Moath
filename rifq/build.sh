#!/usr/bin/env bash
# يقسم الصوت إلى كلمات ويبني الخط الزمني، ثم يصدّر الفيديو rifq.mp4
# الاستعمال: ./build.sh   (يحتاج python3 وffmpeg وnode مع playwright)
set -euo pipefail
cd "$(dirname "$0")"

python3 timeline.py > /dev/null          # voice-cut.mp3 + timeline.js
END=$(sed -n 's/^const END = \(.*\);/\1/p' timeline.js)

rm -rf .frames && mkdir .frames
node render.js "$PWD" "$END"
ffmpeg -hide_banner -loglevel error -y -framerate 30 -i .frames/f%04d.png -i voice-cut.mp3 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -t "$END" -movflags +faststart rifq.mp4
rm -rf .frames
echo "rifq.mp4 جاهز"
