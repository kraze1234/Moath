"""يولّد مؤثرات صوتية بسيطة مجانية (تركيب صوتي عبر ffmpeg، بلا ملفات خارجية) داخل public/sfx.
تشغيل: python3 scripts/make-sfx.py
"""
import os, subprocess

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sfx")
os.makedirs(OUT, exist_ok=True)

E = "exp(-{k}*{t})"  # غلاف تلاشٍ

SOUNDS = {
    # صوت رياح: ضجيج بني منخفض مع تموج بطيء
    "wind": ("anoisesrc=color=brown:amplitude=0.6:d=20", "lowpass=f=500,tremolo=f=0.15:d=0.7,volume=1.6"),
    # همهمة مرعبة: نغمتان منخفضتان متنافرتان
    "drone": ("aevalsrc='0.35*sin(2*PI*55*t)+0.3*sin(2*PI*58.3*t)+0.12*sin(2*PI*110.7*t)':d=16", "tremolo=f=0.25:d=0.5"),
    # صراصير الليل: نغمة حادة متقطعة
    "crickets": ("aevalsrc='0.12*sin(2*PI*4300*t)*(lt(mod(t,0.9),0.22))*(0.5+0.5*sin(2*PI*28*t))':d=12", "highpass=f=2000"),
    # نبض قلب: دقتان كل 0.9 ثانية
    "heartbeat": ("aevalsrc='0.9*sin(2*PI*48*t)*(exp(-40*mod(t,0.9))+0.7*exp(-40*abs(mod(t,0.9)-0.2))*gt(mod(t,0.9),0.2))':d=12", "lowpass=f=160,volume=2"),
    # ثلاث طرقات على الباب
    "knock": ("aevalsrc='(random(0)*2-1)*(exp(-60*t)+exp(-60*abs(t-0.32))*gt(t,0.32)+exp(-60*abs(t-0.64))*gt(t,0.64))':d=1.4", "lowpass=f=700,volume=2.5"),
    # صرير باب: نغمة تتأرجح
    "creak": ("aevalsrc='0.35*sin(2*PI*(260+140*sin(2*PI*0.9*t))*t)*(1-t/2.2)':d=2.2", "tremolo=f=28:d=0.8,lowpass=f=1800"),
    # رنين هاتف: نغمتان في دفعات
    "ring": ("aevalsrc='0.3*(sin(2*PI*880*t)+sin(2*PI*1320*t))*lt(mod(t,1.6),0.9)*gt(sin(2*PI*16*t),0)':d=7", "lowpass=f=3000"),
    # تعطل محرك: ضجيج يتقطع ويخفت
    "engine": ("aevalsrc='(0.6*sin(2*PI*68*t)+0.4*(random(0)*2-1))*gt(sin(2*PI*(9-3*t)*t),0)*exp(-0.9*t)':d=2.8", "lowpass=f=600,volume=1.8"),
    # ضربة رعب: نغمة منخفضة وضجيج يتلاشى
    "sting": ("aevalsrc='(0.6*sin(2*PI*98*t)+0.5*sin(2*PI*104*t)+0.3*(random(0)*2-1)*exp(-6*t))*exp(-1.4*t)':d=2.8", "lowpass=f=2500"),
    # همس: ضجيج عالٍ متقطع كأنفاس
    "whisper": ("anoisesrc=color=white:amplitude=0.25:d=3.5", "highpass=f=1800,lowpass=f=6000,tremolo=f=5:d=0.9,volume=1.2"),
    # خطوات على الرمل
    "footsteps": ("aevalsrc='(random(0)*2-1)*exp(-35*mod(t,0.48))':d=6", "lowpass=f=400,volume=1.6"),
}

for name, (src, fx) in SOUNDS.items():
    out = os.path.join(OUT, f"{name}.wav")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", src, "-af", f"{fx},afade=t=in:d=0.02",
                    "-ac", "1", "-ar", "44100", out], check=True)
    print("✓", name)
