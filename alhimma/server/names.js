'use strict';
/* استقبال قوائم الأسماء: استخراج، تنظيف، توحيد، إزالة التكرار، مطابقة بالأعلام الموجودة وبنصوص المصادر المستوردة.
 * لا يُنشئ النظام أي علم تلقائيًا: كل مرشح يبقى "بانتظار قرار المشرف". */
const AR = require('../shared/arabic.js');

const NAME_HEADERS = ['الاسم', 'اسم', 'العلم', 'الشخصيه', 'اسم العلم', 'name', 'full name', 'person'];
const DEATH_HEADERS = ['الوفاه', 'سنه الوفاه', 'ت', 'توفي', 'death', 'death year', 'died'];
const CAT_HEADERS = ['التصنيف', 'الفئه', 'الطبقه', 'المجال', 'category', 'type'];
const NOTE_HEADERS = ['ملاحظات', 'ملاحظه', 'notes', 'note', 'نبذه'];

// كلمات تدل على عنوان قسم داخل القائمة ← تلميح بالتصنيف (المشرف يقرر في النهاية)
const CATEGORY_HINTS = [
  { re: /محدث|حديث/, id: 'muhaddith' },
  { re: /فقه|فقيه/, id: 'faqih' },
  { re: /مجاهد|قاده|قائد|فاتح|قواد/, id: 'qaid' },
  { re: /زهاد|عباد|زاهد|زهد|عابد/, id: 'zahid' },
  { re: /مفسر|تفسير/, id: 'mufassir' },
  { re: /قراء|قراءات|مقرئ|قارئ/, id: 'qari' },
  { re: /موسوعي/, id: 'mawsui' },
];
// كلمات عناوين الأقسام: سطر مكوّن منها فقط يُعد عنوانًا لا اسمًا
const HEADING_WORDS = new Set(['فرع', 'قسم', 'تصنيف', 'طبقه', 'طبقات', 'و', 'من', 'اعلام', 'المحدثون', 'المحدثين', 'محدثون', 'محدثين', 'الحديث',
  'الفقهاء', 'فقهاء', 'الفقه', 'المجاهدون', 'المجاهدين', 'مجاهدون', 'القاده', 'قاده', 'القواد', 'الزهاد', 'زهاد', 'العباد', 'عباد', 'الزهد',
  'المفسرون', 'المفسرين', 'مفسرون', 'التفسير', 'القراء', 'قراء', 'القراءات', 'العلماء', 'علماء', 'الموسوعيون', 'الموسوعيين', 'موسوعيون']);

function hintCategory(text) {
  const n = AR.normalize(text);
  for (const h of CATEGORY_HINTS) if (h.re.test(n)) return h.id;
  return null;
}

/** استخراج سنة الوفاة المذكورة في السطر — تُعرض تلميحًا فقط، ولا تُعتمد دون مصدر */
function extractDeath(raw) {
  const s = AR.toLatinDigits(raw);
  const pats = [
    /\(\s*ت\s*[:.]?\s*(\d{1,4})\s*(?:هـ|ه)?\s*\)/,
    /(?:^|\s)ت\s*[:.]\s*(\d{1,4})/,
    /(?:المتوفي|المتوفى|توفي)\s*(?:سنه|سنة|عام)?\s*(\d{1,4})/,
    /(\d{1,4})\s*(?:هـ|ه)(?:\s|$|\))/,
  ];
  for (const p of pats) {
    const m = s.match(p);
    if (m) { const y = +m[1]; if (y > 0 && y < 1500) return y; }
  }
  return null;
}

/** تنظيف سطر اسم: حذف الترقيم والرموز والتواريخ بين أقواس، مع الإبقاء على الاسم كما كُتب */
function cleanName(raw) {
  let s = String(raw || '').replace(/‏|‎|‫|‬/g, '').trim();
  s = s.replace(/^[\s#*•●▪◦\-–—>]+/, '');
  s = s.replace(/^[(\[]?[0-9٠-٩]+[)\].\-–:]\s*/, '');
  s = s.replace(/\*\*/g, '');
  const death = extractDeath(s);
  let note = '';
  // ما بين الأقواس (تواريخ أو تعريفات) يُفصل ملاحظةً
  s = s.replace(/[(\[]([^)\]]*)[)\]]/g, (_, inner) => { note += (note ? '؛ ' : '') + inner.trim(); return ' '; });
  // ما بعد الشرطة أو النقطتين غالبًا وصف
  const m = s.match(/^(.+?)\s+[-–—:]\s+(.+)$/);
  if (m && m[1].split(' ').length >= 2) { note += (note ? '؛ ' : '') + m[2].trim(); s = m[1]; }
  s = s.replace(/\s+/g, ' ').replace(/[،,.؛;]+$/, '').trim();
  return { name: s, deathHint: death, note: note || null };
}

function isHeading(line) {
  const t = line.trim();
  if (/^#{1,6}\s/.test(t)) return true;
  if (/[:：]\s*$/.test(t) && t.split(/\s+/).length <= 6) return true;
  if (/^(أولا|ثانيا|ثالثا|رابعا|خامسا|أولًا|ثانيًا|ثالثًا|رابعًا|خامسًا)\b/.test(t)) return true;
  if (/^[0-9٠-٩]/.test(t)) return false;
  const words = AR.normalize(t).split(' ').filter(Boolean);
  return words.length > 0 && words.length <= 5 && words.every((w) => HEADING_WORDS.has(w));
}

function findCol(header, list) {
  const h = header.map((x) => AR.normalize(x).toLowerCase());
  for (const name of list) { const i = h.indexOf(name); if (i >= 0) return i; }
  return -1;
}

/** تحويل صفوف الملف إلى مرشحين */
function extractCandidates(rows) {
  if (!rows || !rows.length) return [];
  const header = rows[0];
  let nameCol = findCol(header, NAME_HEADERS);
  const out = [];
  if (nameCol >= 0) {
    const deathCol = findCol(header, DEATH_HEADERS), catCol = findCol(header, CAT_HEADERS), noteCol = findCol(header, NOTE_HEADERS);
    for (const r of rows.slice(1)) {
      const raw = r[nameCol] || '';
      if (!raw.trim()) continue;
      const c = cleanName(raw);
      const deathCell = deathCol >= 0 ? extractDeath(r[deathCol] + 'هـ') || parseInt(AR.toLatinDigits(r[deathCol]), 10) || null : null;
      out.push({
        raw, name: c.name, deathHint: deathCell || c.deathHint,
        categoryHint: catCol >= 0 ? hintCategory(r[catCol] || '') || (r[catCol] || null) : null,
        note: [c.note, noteCol >= 0 ? r[noteCol] : null].filter(Boolean).join('؛ ') || null,
      });
    }
    return out;
  }
  // بلا ترويسة: كل سطر اسم، وعناوين الأقسام تعطي تلميح التصنيف
  let section = null;
  for (const r of rows) {
    const line = (r[0] || '').trim();
    if (!line) continue;
    if (isHeading(line)) { section = hintCategory(line) || section; continue; }
    const c = cleanName(line);
    if (!c.name || c.name.length < 3 || !/[؀-ۿa-zA-Z]/.test(c.name)) continue;
    if (c.name.split(' ').length > 14) continue; // فقرة نصية لا اسم
    out.push({ raw: line, name: c.name, deathHint: c.deathHint, categoryHint: section, note: c.note });
  }
  return out;
}

/** إزالة التكرار داخل القائمة نفسها (بالمفتاح الموحد) مع حفظ الصيغ البديلة */
function dedupe(cands) {
  const map = new Map();
  const result = [];
  for (const c of cands) {
    const key = AR.nameKey(c.name);
    if (!key) continue;
    if (map.has(key)) {
      const ex = map.get(key);
      ex.duplicates = (ex.duplicates || 0) + 1;
      if (c.raw !== ex.raw) (ex.variants = ex.variants || []).push(c.raw);
      ex.deathHint = ex.deathHint || c.deathHint;
      ex.categoryHint = ex.categoryHint || c.categoryHint;
      continue;
    }
    const item = { ...c, key };
    map.set(key, item);
    result.push(item);
  }
  return result;
}

/** مطابقة مرشح بالأعلام الموجودة (بالاسم والصيغ البديلة) */
function matchPersons(name, persons, limit) {
  const scored = [];
  for (const p of persons) {
    const names = [p.name, p.fullName, ...(p.aliases || [])].filter(Boolean);
    let best = 0;
    for (const n of names) best = Math.max(best, AR.similarity(name, n));
    if (best >= 0.6) scored.push({ personId: p.id, name: p.name, score: best, death: p.death && p.death.year });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit || 3);
}

/** البحث عن الاسم في نصوص المصادر المستوردة: يعيد مواضع مرشحة للتوثيق (يراجعها المشرف) */
function searchDocuments(name, docs, loadText, limit) {
  const key = AR.nameKey(name);
  const words = key.split(' ').filter((w) => w.length > 1);
  if (!words.length) return [];
  const hits = [];
  for (const d of docs) {
    const pages = loadText(d.id);
    for (const pg of pages) {
      const norm = AR.canonKunya(AR.normalize(pg.text));
      let pos = norm.indexOf(key);
      let exact = pos >= 0;
      if (!exact && words.length >= 2) {
        // تطابق جزئي: أول كلمتين متجاورتين
        pos = norm.indexOf(words.slice(0, 2).join(' '));
      }
      if (pos < 0) continue;
      const start = Math.max(0, pos - 80);
      hits.push({
        documentId: d.id, sourceId: d.sourceId || null, title: d.title, vol: pg.vol, page: pg.page, section: pg.section || null,
        exact, snippet: (start > 0 ? '…' : '') + norm.slice(start, pos + key.length + 120) + '…',
      });
      if (hits.length >= (limit || 6)) return hits;
    }
  }
  return hits.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0));
}

module.exports = { cleanName, extractDeath, extractCandidates, dedupe, matchPersons, searchDocuments, hintCategory, isHeading };
