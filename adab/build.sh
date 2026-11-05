#!/usr/bin/env bash
# يبني الخط الزمني من الصوت ويصدّر adab.mp4
# الاستعمال: ./build.sh   (يحتاج voice.mp3 وwords.json من Whisper، وpython3 وffmpeg وnode مع playwright)
set -euo pipefail
cd "$(dirname "$0")"
python3 timeline.py voice.mp3 words.json > /dev/null      # timeline.js + voice-cut.mp3
END=$(sed -n 's/^const END = \(.*\);/\1/p' timeline.js)
rm -rf .frames && mkdir .frames
node render.js "$PWD" "$END"
ffmpeg -hide_banner -loglevel error -y -framerate 30 -i .frames/f%04d.png -i voice-cut.mp3 \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -t "$END" -movflags +faststart adab.mp4
rm -rf .frames
echo "adab.mp4 جاهز"
