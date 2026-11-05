#!/usr/bin/env bash
# يبني الخط الزمني ويصدّر الفيديو ihtiram.mp4
# بدون صوت: ./build.sh            (توقيت تقديري، فيديو صامت للمعاينة)
# مع الصوت: ./build.sh voice.mp3 words.json   (words.json توقيت الكلمات من Whisper)
set -euo pipefail
cd "$(dirname "$0")"

if [ $# -ge 2 ]; then
  python3 timeline.py "$1" "$2" > /dev/null
  # الصوت يبدأ بعد LEAD ثانية (ظهور «الاحترام» الكبير)
  LEAD=$(sed -n 's/^const LEAD = \(.*\);/\1/p' timeline.js)
  ffmpeg -hide_banner -loglevel error -y -i "$1" -af "adelay=$(awk "BEGIN{printf \"%d\", $LEAD*1000}")" -c:a libmp3lame -b:a 192k voice-cut.mp3
else
  python3 timeline.py > /dev/null
fi
END=$(sed -n 's/^const END = \(.*\);/\1/p' timeline.js)

rm -rf .frames && mkdir .frames
node render.js "$PWD" "$END"
if [ -f voice-cut.mp3 ] && [ $# -ge 2 ]; then
  ffmpeg -hide_banner -loglevel error -y -framerate 30 -i .frames/f%04d.png -i voice-cut.mp3 \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -t "$END" -movflags +faststart ihtiram.mp4
else
  ffmpeg -hide_banner -loglevel error -y -framerate 30 -i .frames/f%04d.png \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart ihtiram.mp4
fi
rm -rf .frames
echo "ihtiram.mp4 جاهز"
