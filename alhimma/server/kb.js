'use strict';
/* القاعدة المعرفية: كل معلومة عن علم "ادعاء" (claim) له مصادره وحالة مراجعته.
 * الألعاب لا تستعمل إلا المعتمد، والتجريبي فقط إن سمحت الإعدادات بذلك.
 *
 * claim = { id, personId, kind, value, citations:[{sourceId, documentId, vol, page, url, excerpt}], status, demo, note }
 *   death/birth: { year, approx }   work: { title }   teacher: { personId }   place: { name, placeId }
 *   madhhab: { name }   quote: { text }   stance: { text, lesson }   trait/other: { text }
 */
const AR = require('../shared/arabic.js');

const SHAMELA_BASE = 'https://shamela.ws';

/** رابط صفحة في المكتبة الشاملة — يُبنى فقط من رقم كتاب ورقم صفحة أدخلهما المشرف */
function shamelaUrl(bookId, page) {
  const b = parseInt(bookId, 10);
  if (!b || b < 1) return null;
  const p = parseInt(page, 10);
  return SHAMELA_BASE + '/book/' + b + (p > 0 ? '/' + p : '');
}

function citationUrl(c, sourcesById) {
  if (c.url) return c.url;
  const s = c.sourceId && sourcesById[c.sourceId];
  if (s && s.shamelaId) return shamelaUrl(s.shamelaId, c.shamelaPage || null);
  return (s && s.url) || null;
}

function formatCitation(c, sourcesById) {
  const s = (c.sourceId && sourcesById[c.sourceId]) || null;
  const parts = [];
  if (s) parts.push('«' + s.title + '»' + (s.author ? ' — ' + s.author : ''));
  else if (c.title) parts.push('«' + c.title + '»');
  if (c.vol) parts.push('ج' + AR.toArabicDigits(c.vol));
  if (c.page) parts.push('ص' + AR.toArabicDigits(c.page));
  return parts.join('، ');
}

function claimText(claim, personsById) {
  const v = claim.value || {};
  const p = personsById[claim.personId];
  const n = p ? p.name : '';
  switch (claim.kind) {
    case 'death': return n + ': توفي سنة ' + AR.toArabicDigits(v.year) + 'هـ' + (v.approx ? ' تقريبًا' : '');
    case 'birth': return n + ': ولد سنة ' + AR.toArabicDigits(v.year) + 'هـ' + (v.approx ? ' تقريبًا' : '');
    case 'work': return 'من مؤلفات ' + n + ': «' + v.title + '»';
    case 'teacher': { const t = personsById[v.personId]; return n + ' تتلمذ على ' + (t ? t.name : '؟'); }
    case 'place': return n + ': ' + AR.placePhrase(v.relation, v.name);
    case 'madhhab': return n + ': من أعلام المذهب ' + v.name;
    case 'quote': return 'من أقوال ' + n + ': «' + v.text + '»';
    case 'stance': return n + ': ' + v.text;
    default: return (n ? n + ': ' : '') + (v.text || '');
  }
}

class KB {
  constructor(db) { this.db = db; }

  get demoAllowed() { return !!this.db.data.settings.demoInPlay; }

  /** هل يصلح العنصر للعب؟ معتمد، وغير تجريبي إلا إن سُمح */
  usable(x) {
    return x && x.status === 'approved' && (!x.demo || this.demoAllowed);
  }

  maps() {
    const d = this.db.data;
    const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
    return { persons: by(d.persons), sources: by(d.sources), places: by(d.places), events: by(d.events) };
  }

  persons() { return this.db.data.persons.filter((p) => this.usable(p)); }

  claims(personId, kind) {
    return this.db.data.claims.filter((c) => (!personId || c.personId === personId) && (!kind || c.kind === kind) && this.usable(c));
  }

  /** سنة الوفاة المعتمدة؛ null إذا لم تثبت أو تعارضت الروايات المعتمدة */
  deathYear(personId) {
    const ys = [...new Set(this.claims(personId, 'death').map((c) => +c.value.year).filter(Boolean))];
    return ys.length === 1 ? ys[0] : null;
  }

  /** ملف العلم للعب: بياناته المعتمدة فقط */
  profile(person) {
    const cl = this.claims(person.id);
    const pick = (k) => cl.filter((c) => c.kind === k);
    const death = this.deathYear(person.id);
    return {
      person, death, century: death ? AR.century(death) : null,
      works: pick('work'), teachers: pick('teacher'), places: pick('place'), madhhab: pick('madhhab')[0] || null,
      quotes: pick('quote'), stances: pick('stance'), traits: pick('trait').concat(pick('other')),
      students: this.claims(null, 'teacher').filter((c) => c.value.personId === person.id),
      claims: cl,
    };
  }

  /** التعارضات: قيم مختلفة لنفس المعلومة الأحادية (الوفاة، الولادة، المذهب) لنفس العلم */
  conflicts() {
    const groups = new Map();
    for (const c of this.db.data.claims) {
      if (!['death', 'birth', 'madhhab'].includes(c.kind) || c.status === 'rejected') continue;
      const k = c.personId + '|' + c.kind;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const out = [];
    const { persons } = this.maps();
    for (const [k, arr] of groups) {
      const vals = new Set(arr.map((c) => JSON.stringify(c.kind === 'madhhab' ? AR.normalize(c.value.name) : +c.value.year)));
      if (vals.size > 1) {
        const [personId, kind] = k.split('|');
        out.push({ personId, personName: persons[personId] ? persons[personId].name : personId, kind, claims: arr });
      }
    }
    // أحداث بتواريخ متعارضة مسجلة في حقل yearAlt
    for (const e of this.db.data.events) {
      if (e.yearAlt && e.status !== 'rejected') out.push({ eventId: e.id, personName: e.title, kind: 'event-year', claims: [], note: 'تاريخ الواقعة: ' + e.year + ' أو ' + e.yearAlt });
    }
    return out;
  }

  /** معلومة تعليمية تُعرض بعد السؤال: معلومة معتمدة عن العلم لم تُستعمل في السؤال */
  learnFor(question) {
    const refs = question.refs || {};
    const used = new Set(refs.claimIds || []);
    const { persons, sources } = this.maps();
    const pids = refs.personIds || [];
    const pool = [];
    for (const pid of pids) for (const c of this.claims(pid)) if (!used.has(c.id)) pool.push(c);
    if (!pool.length) return null;
    // تفضيل ما له مصدر موثق
    pool.sort((a, b) => (b.citations || []).length - (a.citations || []).length);
    const top = pool.filter((c) => (c.citations || []).length === (pool[0].citations || []).length);
    const c = top[Math.floor(Math.random() * top.length)];
    return this.presentClaim(c, persons, sources);
  }

  presentClaim(c, persons, sources) {
    if (!persons) ({ persons, sources } = this.maps());
    return {
      claimId: c.id, text: claimText(c, persons), demo: !!c.demo,
      citations: (c.citations || []).map((x) => ({ label: formatCitation(x, sources), url: citationUrl(x, sources), excerpt: x.excerpt || null })),
    };
  }

  /** المصادر الموثقة لمجموعة ادعاءات */
  citationsFor(claimIds) {
    const { persons, sources } = this.maps();
    const out = [];
    for (const id of claimIds || []) {
      const c = this.db.get('claims', id);
      if (c) out.push(this.presentClaim(c, persons, sources));
    }
    return out;
  }
}

module.exports = { KB, shamelaUrl, formatCitation, claimText, citationUrl };
