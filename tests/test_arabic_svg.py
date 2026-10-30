"""فحص النصوص العربية داخل رسوم SVG: ترتيب الحروف (أول حرف يمينًا) وعدم الخروج عن حدود الرسم، على الجوال واللوحي والكمبيوتر.
التشغيل:  python3 tests/test_arabic_svg.py index.html out tests/mock-speech.js
النتيجة المتوقعة: المشكلات الوحيدة المسموحة هي الأرقام «٠١…٠٥» (تُكتب من اليسار طبيعيًا).
"""
import os
import sys
from playwright.sync_api import sync_playwright
P="file://"+os.path.abspath(sys.argv[1]); OUT=sys.argv[2]; os.makedirs(OUT,exist_ok=True); MOCK=open(sys.argv[3]).read()
JS = r"""
() => {
  const ar=/[؀-ۿ]/; const bad=[]; let n=0;
  document.querySelectorAll('svg text').forEach(t=>{
    const s=t.textContent; if(!ar.test(s)) return;
    const svg=t.ownerSVGElement; if(!svg || svg.getBoundingClientRect().width===0) return;
    if(t.closest('[opacity="0"]')) {/* still measure */}
    n++;
    // find first and last Arabic letters (logical order)
    let i0=-1,i1=-1; for(let i=0;i<s.length;i++){ if(ar.test(s[i])&&s[i]!=='ـ'){ if(i0<0)i0=i; i1=i; } }
    try{
      const a=t.getStartPositionOfChar(i0).x, b=t.getStartPositionOfChar(i1).x;
      if(!(a>b)) bad.push({text:s, first:a, last:b, why:'order'});
      const bb=t.getBBox(), vb=svg.viewBox.baseVal;
      // convert to svg root coords via CTM relative to svg
      const m=t.getCTM(), sm=svg.getCTM(); const inv=sm.inverse().multiply(m);
      const x1=inv.a*bb.x+inv.e, x2=inv.a*(bb.x+bb.width)+inv.e;
      if(svg.id!=='world' && vb && vb.width && (x1< -1 || x2>vb.width+1)) bad.push({text:s,x1,x2,w:vb.width,why:'clipped'});
    }catch(e){ bad.push({text:s,why:'err '+e}); }
  });
  return {n,bad};
}
"""
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp,mob in [("mobile",{"width":390,"height":844},True),("desktop",{"width":1366,"height":800},False),("tablet",{"width":820,"height":1180},True)]:
        c=b.new_context(viewport=vp,is_mobile=mob,has_touch=mob,device_scale_factor=2 if mob else 1); c.add_init_script(MOCK)
        pg=c.new_page(); pg.goto(P); pg.wait_for_timeout(700)
        r=pg.evaluate(JS); tot=r["n"]; bads=r["bad"]
        pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
        for k in range(9):
            pg.keyboard.press("ArrowLeft"); pg.keyboard.press("ArrowLeft"); pg.keyboard.press("ArrowLeft")
            r=pg.evaluate(JS); tot+=r["n"]; bads+=r["bad"]
            title=pg.inner_text("#winTitle")
            if name=="mobile":
                pg.evaluate("(()=>{const s=document.querySelector('.w-main svg, .w-main .wide'); if(s) s.scrollIntoView({block:'center'})})()")
                pg.wait_for_timeout(250); pg.screenshot(path=f"{OUT}/rtl-{k}.png")
            if k<8: pg.click("#winNext"); pg.wait_for_timeout(450)
        pg.click("#winBack"); pg.wait_for_timeout(1300)
        if name=="mobile":
            for i in range(9):
                pg.screenshot(path=f"{OUT}/road-{i}.png"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(1200)
        seen=set(); uniq=[x for x in bads if not (x['text']+x['why'] in seen or seen.add(x['text']+x['why']))]
        print(name,"arabic svg texts checked:",tot,"problems:",len(uniq))
        for x in uniq[:20]: print("  ",x)
    b.close()
