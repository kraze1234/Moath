(() => {
  const log = window.__log = []; let q = [], cur = null, t = null;
  class U { constructor(text){ this.text=text; } }
  window.SpeechSynthesisUtterance = U;
  const voices=[{name:"Test Arabic",lang:"ar-SA",localService:true},{name:"Test English",lang:"en-US",localService:true}];
  function run(){ if(cur||!q.length) return; cur=q.shift(); window.__speaking=true; log.push("speak:"+cur.text.slice(0,20));
    const u=cur; t=setTimeout(()=>{ u.onboundary&&u.onboundary({charIndex:Math.floor(u.text.length/2)}); t=setTimeout(()=>{ if(cur!==u) return; cur=null; window.__speaking=false; u.onend&&u.onend({}); run(); },300); },300); }
  const ss = { getVoices:()=>voices, speak(u){ q.push(u); run(); }, cancel(){ log.push("cancel"); clearTimeout(t); const c=cur; q=[]; cur=null; window.__speaking=false; if(c&&c.onerror) c.onerror({error:"interrupted"}); }, pause(){}, resume(){}, addEventListener(){}, };
  Object.defineProperty(window,"speechSynthesis",{value:ss,configurable:true});
})();
