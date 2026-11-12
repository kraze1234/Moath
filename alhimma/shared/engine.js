/* محرك الأسئلة: التهيئة (الخلط)، الإخفاء للاعبين، التصحيح، حساب النقاط — مشترك (UMD)
 *
 * أشكال بيانات السؤال (q.type / q.data):
 *  choice : { options:[..], answer:i, excerpt?, sentence?, pins?:[{label,lat,lon}] }
 *  reveal : { clues:[..], options:[..], answer:i }            إجابة اللاعب: { choice, used }
 *  card   : { segments:[{label,value}], options:[..], answer:i } إجابة اللاعب: { choice, revealed }
 *  order  : { items:[{label, value, shown}] }  الترتيب الصحيح تصاعدي بحسب value؛ إجابة اللاعب: مصفوفة فهارس
 *  match  : { left:[..], right:[..] }  left[i] ↔ right[i] قبل الخلط؛ بعد التهيئة key[i] موضع جواب left[i]
 *  bucket : { buckets:[..], items:[{label, bucket}] }  إجابة اللاعب: رقم السلة لكل عنصر
 *  spot   : { statements:[..], wrong:i, correction }   إجابة اللاعب: رقم العبارة الخاطئة
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./catalog.js'));
  else root.HimmaEngine = factory(root.HimmaCatalog);
})(typeof self !== 'undefined' ? self : this, function (Catalog) {
  'use strict';

  function rngFrom(seed) {
    if (seed == null) return Math.random;
    let s = (typeof seed === 'number' ? seed : hash(String(seed))) >>> 0 || 1;
    return function () { // mulberry32
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    rng = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /** خلط يضمن ألا يبقى الترتيب كما هو (حين يكون ذلك ممكنًا) */
  function derange(n, rng) {
    const idx = [...Array(n).keys()];
    if (n < 2) return idx;
    for (let tries = 0; tries < 20; tries++) {
      const p = shuffle(idx, rng);
      if (p.some((v, i) => v !== i)) return p;
    }
    return idx.reverse();
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));

  /** تهيئة سؤال للعرض: خلط الخيارات/العناصر مع الإبقاء على مفاتيح الإجابة في الفضاء الجديد */
  function prepare(question, seed) {
    const q = clone(question);
    const rng = rngFrom(seed);
    const d = q.data || {};
    switch (q.type) {
      case 'choice': case 'reveal': case 'card': {
        const p = shuffle([...d.options.keys()], rng);
        d.options = p.map((i) => question.data.options[i]);
        d.answer = p.indexOf(question.data.answer);
        break;
      }
      case 'order': {
        const p = derange(d.items.length, rng);
        d.items = p.map((i) => question.data.items[i]);
        break;
      }
      case 'match': {
        const p = derange(d.right.length, rng);
        d.right = p.map((i) => question.data.right[i]);
        d.key = question.data.left.map((_, i) => p.indexOf(i));
        break;
      }
      case 'bucket': {
        d.items = shuffle(d.items, rng);
        break;
      }
      case 'spot': {
        const p = shuffle([...d.statements.keys()], rng);
        d.statements = p.map((i) => question.data.statements[i]);
        d.wrong = p.indexOf(question.data.wrong);
        break;
      }
    }
    q.data = d;
    return q;
  }

  /** نسخة للاعبين: بلا إجابات ولا شرح */
  function strip(prepared) {
    const q = clone(prepared);
    const d = q.data || {};
    delete d.answer; delete d.key; delete d.wrong; delete d.correction;
    if (d.items) d.items = d.items.map((it) => ({ label: it.label }));
    delete q.explanation; delete q.learn; delete q.refs; delete q.sourceNote;
    return q;
  }

  /** الترتيب الصحيح لعناصر سؤال ترتيب (فهارس العناصر المعروضة) */
  function orderKey(q) {
    return [...q.data.items.keys()].sort((a, b) => q.data.items[a].value - q.data.items[b].value);
  }

  /** التصحيح: يعيد { fraction, correct, detail } */
  function grade(q, answer) {
    const d = q.data;
    let fraction = 0, detail = null;
    if (answer == null) return { fraction: 0, correct: false, detail: null };
    switch (q.type) {
      case 'choice':
        fraction = Number(answer) === d.answer ? 1 : 0;
        break;
      case 'reveal': case 'card':
        fraction = Number(answer.choice) === d.answer ? 1 : 0;
        break;
      case 'spot':
        fraction = Number(answer) === d.wrong ? 1 : 0;
        break;
      case 'order': {
        const key = orderKey(q);
        // درجة جزئية: نسبة العناصر في مواضعها الصحيحة (مع اعتبار السنوات المتساوية)
        let ok = 0;
        detail = (answer || []).map((itemIdx, pos) => {
          const good = d.items[itemIdx] && d.items[key[pos]] && d.items[itemIdx].value === d.items[key[pos]].value;
          if (good) ok++;
          return good;
        });
        fraction = key.length ? ok / key.length : 0;
        break;
      }
      case 'match': {
        let ok = 0;
        detail = d.key.map((k, i) => { const g = Number(answer[i]) === k; if (g) ok++; return g; });
        fraction = d.key.length ? ok / d.key.length : 0;
        break;
      }
      case 'bucket': {
        let ok = 0;
        detail = d.items.map((it, i) => { const g = Number(answer[i]) === it.bucket; if (g) ok++; return g; });
        fraction = d.items.length ? ok / d.items.length : 0;
        break;
      }
    }
    fraction = Math.round(fraction * 100) / 100;
    return { fraction, correct: fraction === 1, detail };
  }

  /** حساب النقاط بحسب الصعوبة والجولة والتلميحات المستخدمة والسرعة */
  function points(q, fraction, opts) {
    opts = opts || {};
    const base = (Catalog.DIFFICULTY[q.difficulty] || Catalog.DIFFICULTY[1]).points * (opts.multiplier || 1);
    let f = fraction;
    if (q.type === 'reveal') {
      const used = Math.max(1, (opts.answer && opts.answer.used) || 1);
      f *= Math.max(0.25, 1 - 0.2 * (used - 1));
    }
    if (q.type === 'card') {
      const rev = (opts.answer && opts.answer.revealed) || 0;
      f *= Math.max(0.25, 1 - 0.15 * rev);
    }
    if (q.type === 'order' || q.type === 'match' || q.type === 'bucket') {
      if (fraction < 0.5) f = 0; // لا نقاط لأقل من النصف
    }
    let pts = base * f;
    if (opts.speedFactor && fraction === 1) pts += base * 0.5 * Math.max(0, Math.min(1, opts.speedFactor));
    return Math.round(pts / 5) * 5;
  }

  /** نص الإجابة الصحيحة للعرض بعد السؤال */
  function answerText(q) {
    const d = q.data;
    switch (q.type) {
      case 'choice': case 'reveal': case 'card': return d.options[d.answer];
      case 'spot': return d.statements[d.wrong] + (d.correction ? ' ← الصواب: ' + d.correction : '');
      case 'order': return orderKey(q).map((i) => d.items[i].label + (d.items[i].shown ? ' (' + d.items[i].shown + ')' : '')).join(' ← ');
      case 'match': return d.left.map((l, i) => l + ' ↔ ' + d.right[d.key ? d.key[i] : i]).join('، '); // قبل الخلط: left[i] ↔ right[i]
      case 'bucket': return d.items.map((it) => it.label + ': ' + d.buckets[it.bucket]).join('، ');
    }
    return '';
  }

  return { prepare, strip, grade, points, answerText, orderKey, shuffle, rngFrom, hash };
});
