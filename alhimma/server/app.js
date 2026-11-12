'use strict';
/* خادم منصة الهمّة — بلا أطر خارجية (Node http فقط). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DB, uid } = require('./db.js');
const { Auth, readCookie } = require('./auth.js');
const { KB, shamelaUrl } = require('./kb.js'); // shamelaUrl يبني رابط توثيق فقط، دون أي اتصال
const { generate } = require('./generator.js');
const { SessionManager } = require('./sessions.js');
const importers = require('./importers.js');
const names = require('./names.js');
const seed = require('./seed.js');
const Catalog = require('../shared/catalog.js');
const AR = require('../shared/arabic.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const STATIC_MAP = {
  '/shared/': path.join(ROOT, 'shared'),
  '/fonts/kufi/': path.join(ROOT, 'node_modules/@fontsource/noto-kufi-arabic/files'),
  '/fonts/plex/': path.join(ROOT, 'node_modules/@fontsource/ibm-plex-sans-arabic/files'),
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json',
};
const EDITABLE = {
  persons: ['name', 'fullName', 'aliases', 'kunya', 'laqab', 'tabaqa', 'deathText', 'categories', 'primaryCategory', 'level', 'bio', 'bioCitations', 'status', 'notes', 'reviewNote'],
  claims: ['personId', 'kind', 'value', 'citations', 'status', 'note', 'reviewNote'],
  sources: ['title', 'author', 'authorDeath', 'shamelaId', 'url', 'edition', 'notes'],
  events: ['title', 'year', 'yearAlt', 'placeId', 'personIds', 'context', 'outcome', 'citations', 'status', 'note'],
  places: ['name', 'lat', 'lon', 'note'],
  terms: ['term', 'definition', 'madhhab', 'level', 'citations', 'status', 'note'],
  questions: ['mode', 'type', 'style', 'categories', 'difficulty', 'prompt', 'data', 'explanation', 'refs', 'citations', 'status', 'reviewNote'],
  categories: ['name', 'color'],
  teams: ['name', 'color', 'members'],
  competitions: ['name', 'answerMode', 'rounds', 'notes'],
};

function lanAddresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push('http://' + a.address + ':' + port);
  }
  return out;
}

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function createApp(opts) {
  opts = opts || {};
  const dataDir = opts.dataDir || path.join(ROOT, 'data');
  const db = new DB(dataDir);
  const auth = new Auth(dataDir);
  const kb = new KB(db);
  const sessions = new SessionManager(db, kb);
  let port = opts.port || 0;

  // المحتوى العلمي المعتمد الأولي (الطبقة الخامسة) — يُحمّل مرة واحدة
  if (opts.seed !== false) seed.applySeed(db);

  /* ===== أدوات ===== */
  const send = (res, code, body, headers) => {
    const isStr = typeof body === 'string' || Buffer.isBuffer(body);
    res.writeHead(code, { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(isStr ? body : JSON.stringify(body));
  };
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'حجم الطلب أكبر من المسموح (' + Math.round(limit / 1048576) + ' ميغابايت)')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'بيانات JSON غير صالحة')); }
    });
    req.on('error', reject);
  });
  const isAdmin = (req) => auth.check(readCookie(req, 'himma_admin'));
  const requireAdmin = (req) => { if (!isAdmin(req)) throw new HttpError(401, 'يلزم تسجيل دخول المشرف'); };
  const ip = (req) => req.socket.remoteAddress || 'x';
  const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

  function counts() {
    const d = db.data;
    const st = (arr) => arr.reduce((m, x) => { m[x.status || 'none'] = (m[x.status || 'none'] || 0) + 1; return m; }, {});
    return {
      persons: d.persons.length, claims: d.claims.length, sources: d.sources.length, documents: d.documents.length, events: d.events.length,
      questions: d.questions.length, questionsByStatus: st(d.questions), claimsByStatus: st(d.claims), personsByStatus: st(d.persons),
      demo: { persons: d.persons.filter((x) => x.demo).length, questions: d.questions.filter((x) => x.demo).length },
      usableQuestions: d.questions.filter((q) => kb.usable(q)).length,
    };
  }

  function availability() {
    const m = {};
    for (const q of db.data.questions) {
      if (!kb.usable(q)) continue;
      m[q.mode] = m[q.mode] || { total: 0, byCat: {} };
      m[q.mode].total++;
      for (const c of q.categories || []) m[q.mode].byCat[c] = (m[q.mode].byCat[c] || 0) + 1;
    }
    return m;
  }

  function validate(col, rec) {
    const need = { persons: ['name'], claims: ['personId', 'kind'], sources: ['title'], events: ['title'], places: ['name'], terms: ['term', 'definition'],
      questions: ['mode', 'type', 'prompt', 'data'], categories: ['name'], teams: ['name'], competitions: ['name'] }[col] || [];
    for (const k of need) if (rec[k] == null || rec[k] === '') throw new HttpError(400, 'الحقل مطلوب: ' + k);
    if (rec.status && !Catalog.STATUS[rec.status]) throw new HttpError(400, 'حالة غير صالحة');
    if (col === 'claims' && !Catalog.CLAIM_KINDS[rec.kind]) throw new HttpError(400, 'نوع معلومة غير معروف');
    if (col === 'claims' && rec.personId && !db.get('persons', rec.personId)) throw new HttpError(400, 'العلم غير موجود');
    if (col === 'questions' && !['choice', 'reveal', 'card', 'order', 'match', 'bucket', 'spot'].includes(rec.type)) throw new HttpError(400, 'نوع سؤال غير معروف');
    if (rec.difficulty != null && ![1, 2, 3].includes(Number(rec.difficulty))) throw new HttpError(400, 'الصعوبة من 1 إلى 3');
    if (rec.citations) for (const c of rec.citations) {
      if (c.page != null && c.page !== '' && !/^[0-9٠-٩]+$/.test(String(c.page))) throw new HttpError(400, 'رقم الصفحة يجب أن يكون رقمًا');
      if (c.pages != null && c.pages !== '' && !/^[0-9٠-٩]+\s*[–-]\s*[0-9٠-٩]+$|^[0-9٠-٩]+$/.test(String(c.pages))) throw new HttpError(400, 'نطاق الصفحات مثل: 255–269');
    }
  }

  /** توليد رابط الشاملة للإحالات التي لها رقم كتاب */
  function enrichCitations(rec) {
    if (!rec.citations) return rec;
    rec.citations = rec.citations.map((c) => {
      const out = { ...c };
      const s = c.sourceId && db.get('sources', c.sourceId);
      if (!out.url && s && s.shamelaId && c.shamelaPage) out.url = shamelaUrl(s.shamelaId, c.shamelaPage);
      return out;
    });
    return rec;
  }

  function cascadeDelete(col, id) {
    if (col === 'persons') {
      const cl = db.data.claims.filter((c) => c.personId === id || (c.kind === 'teacher' && c.value && c.value.personId === id));
      db.data.claims = db.data.claims.filter((c) => !cl.includes(c));
      for (const q of db.data.questions) {
        if (q.refs && (q.refs.personIds || []).includes(id) && q.status === 'approved') { q.status = 'review'; q.reviewNote = 'حُذف علم مرتبط بالسؤال'; }
      }
      db.save();
    }
    if (col === 'claims') {
      for (const q of db.data.questions) {
        if (q.refs && (q.refs.claimIds || []).includes(id) && q.status === 'approved') { q.status = 'review'; q.reviewNote = 'حُذفت معلومة مرتبطة بالسؤال'; }
      }
      db.save();
    }
    if (col === 'documents') db.removeDocumentText(id);
  }

  /** عند تعديل معلومة معتمدة: الأسئلة المبنية عليها تعود للمراجعة */
  function invalidateQuestions(claimId) {
    let n = 0;
    for (const q of db.data.questions) {
      if (q.status === 'approved' && q.refs && (q.refs.claimIds || []).includes(claimId)) { q.status = 'review'; q.reviewNote = 'تغيرت معلومة يعتمد عليها السؤال'; n++; }
    }
    if (n) db.save();
    return n;
  }

  /** أسئلة اللعب الفردي */
  function playQuestions(query) {
    const modes = (query.get('modes') || '').split(',').filter(Boolean);
    const cats = (query.get('categories') || '').split(',').filter(Boolean);
    const exclude = new Set((query.get('exclude') || '').split(',').filter(Boolean));
    const diffs = (query.get('difficulty') || '').split(',').map(Number).filter(Boolean);
    const count = Math.max(1, Math.min(40, parseInt(query.get('count'), 10) || 10));
    let pool = db.data.questions.filter((q) => kb.usable(q) && (!modes.length || modes.includes(q.mode)) &&
      (!cats.length || (q.categories || []).some((c) => cats.includes(c))) && (!diffs.length || diffs.includes(q.difficulty)));
    const fresh = pool.filter((q) => !exclude.has(q.id));
    const exhausted = fresh.length < Math.min(count, pool.length);
    pool = (fresh.length ? fresh : pool);
    const shuffled = pool.map((q) => [Math.random(), q]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).slice(0, count);
    shuffled.sort((a, b) => a.difficulty - b.difficulty); // تدرج الصعوبة
    return {
      exhausted, total: pool.length,
      questions: shuffled.map((q) => ({
        id: q.id, mode: q.mode, type: q.type, style: q.style, difficulty: q.difficulty, prompt: q.prompt, data: q.data, explanation: q.explanation,
        categories: q.categories, demo: !!q.demo, learn: kb.learnFor(q), citations: kb.questionCitations(q),
      })),
    };
  }

  /* ===== الاستيراد ===== */
  async function doImport(body) {
    const { filename, contentBase64, kind } = body;
    if (!filename || !contentBase64) throw new HttpError(400, 'لم يصل الملف');
    const buf = Buffer.from(contentBase64, 'base64');
    let parsed;
    try { parsed = await importers.parseFile(filename, buf); } catch (e) {
      if (e instanceof importers.ImportError) throw new HttpError(422, e.message);
      throw new HttpError(422, 'تعذرت قراءة الملف: ' + e.message);
    }
    if (kind === 'source') {
      if (!parsed.pages || !parsed.pages.length) {
        parsed.pages = importers.splitPages(parsed.text || (parsed.rows || []).map((r) => r.join(' ')).join('\n'));
      }
      let sourceId = body.sourceId || null;
      if (!sourceId && body.title) {
        sourceId = db.insert('sources', { title: String(body.title).slice(0, 200), author: body.author || '', shamelaId: body.shamelaId ? parseInt(body.shamelaId, 10) : null, notes: 'أُنشئ عند استيراد ملف ' + filename }, 'src').id;
      }
      const src = sourceId ? db.get('sources', sourceId) : null;
      const docRec = db.insert('documents', {
        filename, format: parsed.format, sourceId, title: src ? src.title : (body.title || filename), pagesCount: parsed.pages.length,
        hasPageNumbers: parsed.pages.some((p) => p.page != null), warnings: parsed.warnings,
      }, 'doc');
      db.saveDocumentText(docRec.id, parsed.pages);
      return { kind: 'source', document: docRec, preview: parsed.pages.slice(0, 3), warnings: parsed.warnings };
    }
    if (kind === 'data') {
      // ملف JSON منظم: { persons: [{ name, aliases, categories, claims:[{kind, value, citations}] }] } — يدخل كله «قيد المراجعة»
      const data = parsed.json;
      if (!data || !Array.isArray(data.persons)) throw new HttpError(422, 'ملف البيانات المنظمة يجب أن يحتوي مصفوفة persons');
      let np = 0, nc = 0;
      for (const p of data.persons) {
        if (!p || !p.name) continue;
        const person = db.insert('persons', { name: String(p.name), aliases: p.aliases || [], categories: p.categories || [], primaryCategory: p.primaryCategory || (p.categories || [])[0] || null, level: p.level || 2, bio: p.bio || '', status: 'review', notes: 'مستورد من ' + filename }, 'per');
        np++;
        for (const c of p.claims || []) {
          if (!Catalog.CLAIM_KINDS[c.kind]) continue;
          db.insert('claims', enrichCitations({ personId: person.id, kind: c.kind, value: c.value || {}, citations: c.citations || [], status: 'review', note: 'مستورد من ' + filename }), 'clm');
          nc++;
        }
      }
      return { kind: 'data', persons: np, claims: nc, warnings: parsed.warnings };
    }
    // قائمة أسماء
    const cands = names.dedupe(names.extractCandidates(parsed.rows || []));
    if (!cands.length) throw new HttpError(422, 'لم أجد أسماء في الملف. تأكد أن كل اسم في سطر أو أن في الجدول عمودًا بعنوان «الاسم».');
    const items = cands.map((c) => {
      const matches = names.matchPersons(c.name, db.data.persons, 3);
      const sourceHits = names.searchDocuments(c.name, db.data.documents, (id) => db.loadDocumentText(id), 4);
      return { ...c, matches, sourceHits, decision: matches[0] && matches[0].score >= 0.92 ? 'merge' : 'pending', personId: matches[0] && matches[0].score >= 0.92 ? matches[0].personId : null };
    });
    const rec = db.insert('imports', {
      filename, format: parsed.format, kind: 'names', items, warnings: parsed.warnings, rawCount: (parsed.rows || []).length,
      duplicatesRemoved: cands.reduce((s, c) => s + (c.duplicates || 0), 0), applied: false,
    }, 'imp');
    return { kind: 'names', import: rec };
  }

  function applyImport(imp) {
    let created = 0, merged = 0, skipped = 0;
    for (const it of imp.items) {
      if (it.applied) continue;
      if (it.decision === 'new') {
        const cats = it.categories || (it.categoryHint && db.data.categories.some((c) => c.id === it.categoryHint) ? [it.categoryHint] : []);
        const p = db.insert('persons', {
          name: it.name, aliases: it.variants || [], categories: cats, primaryCategory: cats[0] || null, level: 2, bio: '',
          status: 'review', notes: 'من قائمة الأسماء: ' + imp.filename + (it.note ? ' — ' + it.note : ''), importId: imp.id,
        }, 'per');
        if (it.deathHint) {
          db.insert('claims', { personId: p.id, kind: 'death', value: { year: it.deathHint }, citations: [], status: 'draft', note: 'سنة وردت في قائمة الأسماء — تحتاج توثيقًا من مصدر' }, 'clm');
        }
        for (const h of it.acceptedHits || []) {
          db.insert('claims', { personId: p.id, kind: 'other', value: { text: 'ورد ذكره في المصدر (يحتاج تحديد المعلومة)' },
            citations: [{ sourceId: h.sourceId, documentId: h.documentId, vol: h.vol, page: h.page, excerpt: h.snippet }], status: 'draft', note: 'موضع مرشح من البحث في المصادر' }, 'clm');
        }
        it.personId = p.id; created++;
      } else if (it.decision === 'merge' && it.personId) {
        const p = db.get('persons', it.personId);
        if (p) {
          const al = new Set(p.aliases || []);
          if (AR.nameKey(it.name) !== AR.nameKey(p.name)) al.add(it.name);
          (it.variants || []).forEach((v) => al.add(v));
          db.update('persons', p.id, { aliases: [...al] });
          merged++;
        }
      } else { skipped++; continue; }
      it.applied = true;
    }
    imp.applied = imp.items.every((x) => x.applied || x.decision === 'skip' || x.decision === 'pending');
    db.update('imports', imp.id, { items: imp.items, applied: imp.applied });
    return { created, merged, skipped };
  }

  /* ===== التصدير ===== */
  function csv(rows) {
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  }
  function exportCSV(kind) {
    const d = db.data;
    const pmap = Object.fromEntries(d.persons.map((p) => [p.id, p.name]));
    const smap = Object.fromEntries(d.sources.map((s) => [s.id, s.title]));
    const cname = Object.fromEntries(d.categories.map((c) => [c.id, c.name]));
    if (kind === 'results') {
      return csv([['المسابقة', 'التاريخ', 'الترتيب', 'الفريق', 'النقاط', 'فائز', 'عدد الأسئلة']].concat(
        d.results.flatMap((r) => r.teams.map((t, i) => [r.name, r.date.slice(0, 16).replace('T', ' '), i + 1, t.name, t.score, r.winners.includes(t.name) ? 'نعم' : '', r.questions]))));
    }
    if (kind === 'persons') {
      return csv([['المعرف', 'الاسم', 'الصيغ البديلة', 'التصنيف الرئيسي', 'التصنيفات', 'سنة الوفاة المعتمدة', 'الحالة', 'تجريبي']].concat(
        d.persons.map((p) => [p.id, p.name, (p.aliases || []).join('؛ '), cname[p.primaryCategory] || '', (p.categories || []).map((c) => cname[c] || c).join('؛ '), kb.deathYear(p.id) || '', Catalog.STATUS[p.status] || p.status, p.demo ? 'نعم' : ''])));
    }
    if (kind === 'claims') {
      return csv([['العلم', 'النوع', 'القيمة', 'المصادر', 'الحالة', 'تجريبي']].concat(
        d.claims.map((c) => [pmap[c.personId] || c.personId, Catalog.CLAIM_KINDS[c.kind], JSON.stringify(c.value).replace(/"/g, ''),
          (c.citations || []).map((x) => (smap[x.sourceId] || x.title || '') + (x.vol ? ' ج' + x.vol : '') + (x.page ? ' ص' + x.page : '')).join('؛ '), Catalog.STATUS[c.status], c.demo ? 'نعم' : ''])));
    }
    if (kind === 'questions') {
      return csv([['المعرف', 'النمط', 'الصعوبة', 'السؤال', 'الإجابة', 'الحالة', 'تجريبي', 'مرات الاستخدام']].concat(
        d.questions.map((q) => [q.id, (Catalog.MODES[q.mode] || {}).title || q.mode, q.difficulty, q.prompt, require('../shared/engine.js').answerText(q), Catalog.STATUS[q.status], q.demo ? 'نعم' : '', q.usedCount || 0])));
    }
    throw new HttpError(404, 'نوع تصدير غير معروف');
  }

  /* ===== الملفات الثابتة ===== */
  function serveStatic(req, res, pathname) {
    let file = null;
    for (const [prefix, dir] of Object.entries(STATIC_MAP)) {
      if (pathname.startsWith(prefix)) { file = path.join(dir, path.basename(decodeURIComponent(pathname.slice(prefix.length)))); break; }
    }
    if (!file) {
      let p = decodeURIComponent(pathname);
      if (p === '/') p = '/index.html';
      if (!path.extname(p)) p += '.html';
      file = path.normalize(path.join(PUBLIC, p));
      if (!file.startsWith(PUBLIC)) return send(res, 403, 'ممنوع');
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'الصفحة غير موجودة');
      const ext = path.extname(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size,
        'Cache-Control': ext === '.woff2' || ext === '.woff' ? 'public, max-age=31536000' : 'no-cache',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
        ...(ext === '.html' ? { 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'" } : {}),
      });
      fs.createReadStream(file).pipe(res);
    });
  }

  /* ===== الموجّه ===== */
  async function route(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const m = req.method;
    if (!p.startsWith('/api/')) {
      if (m !== 'GET' && m !== 'HEAD') return send(res, 405, 'غير مسموح');
      return serveStatic(req, res, p);
    }
    // الطلبات المعدِّلة يجب أن تكون JSON (حماية من الطلبات العابرة للمواقع)
    if (m !== 'GET' && !(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'يجب أن يكون الطلب بصيغة JSON');
    const seg = p.split('/').filter(Boolean).slice(1); // بعد api
    const body = m === 'GET' ? {} : await readBody(req, p === '/api/admin/import' || p === '/api/admin/restore' ? 60 * 1048576 : 2 * 1048576);

    /* --- عام --- */
    if (p === '/api/status' && m === 'GET') {
      return send(res, 200, { configured: auth.isConfigured(), admin: isAdmin(req), demoInPlay: !!db.data.settings.demoInPlay, counts: counts(), lan: lanAddresses(port), port });
    }
    if (p === '/api/catalog' && m === 'GET') {
      const persons = kb.persons().map((x) => ({ id: x.id, name: x.name, tabaqa: x.tabaqa || null, deathText: x.deathText || (kb.deathYear(x.id) ? kb.deathYear(x.id) + 'هـ' : 'غير محددة'), death: kb.deathYear(x.id), categories: x.categories, bio: x.bio || '' }));
      const hasDemo = db.data.questions.some((q) => q.demo && kb.usable(q));
      return send(res, 200, { ...Catalog, categories: db.data.categories, availability: availability(), demoInPlay: hasDemo, persons });
    }
    // بطاقة العلم العامة: المعلومات المعتمدة فقط مع إحالاتها، وما يحتاج مراجعة يُذكر عدده دون عرضه
    if (seg[0] === 'persons' && seg[1] && m === 'GET') {
      const person = db.get('persons', seg[1]);
      if (!person || !kb.usable(person)) throw new HttpError(404, 'العلم غير موجود');
      const { persons: pm, sources: sm } = kb.maps();
      return send(res, 200, {
        id: person.id, name: person.name, aliases: person.aliases || [], tabaqa: person.tabaqa || null, deathText: person.deathText || null, bio: person.bio || '',
        citations: (person.bioCitations || []).map((c) => kb.presentCitation(c, sm)),
        facts: kb.claims(person.id).map((c) => ({ kind: c.kind, kindName: Catalog.CLAIM_KINDS[c.kind] || c.kind, text: require('./kb.js').claimText(c, pm) })),
        underReview: db.data.claims.filter((c) => c.personId === person.id && c.status === 'review').length,
      });
    }
    if (p === '/api/play/questions' && m === 'GET') return send(res, 200, playQuestions(url.searchParams));
    if (p === '/api/qr' && m === 'GET') {
      const text = String(url.searchParams.get('text') || '').slice(0, 300);
      if (!text) throw new HttpError(400, 'نص فارغ');
      const qrcode = require('qrcode-generator');
      const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
      return send(res, 200, qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }), { 'Content-Type': 'image/svg+xml' });
    }

    /* --- الدخول --- */
    if (p === '/api/auth/setup' && m === 'POST') {
      if (auth.isConfigured()) throw new HttpError(409, 'تم إعداد كلمة المرور مسبقًا');
      try { auth.setPassword(body.password); } catch (e) { throw new HttpError(400, e.message); }
      const r = auth.login(ip(req), body.password);
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie(r.token) });
    }
    if (p === '/api/auth/login' && m === 'POST') {
      if (!auth.isConfigured()) throw new HttpError(409, 'لم تُعدّ كلمة مرور المشرف بعد');
      const r = auth.login(ip(req), body.password);
      if (!r.ok) throw new HttpError(401, r.error);
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie(r.token) });
    }
    if (p === '/api/auth/logout' && m === 'POST') {
      auth.logout(readCookie(req, 'himma_admin'));
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie('', 0) });
    }
    if (p === '/api/auth/me' && m === 'GET') return send(res, 200, { admin: isAdmin(req), configured: auth.isConfigured() });
    if (p === '/api/auth/password' && m === 'POST') {
      requireAdmin(req);
      if (!auth.verify(body.current)) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
      try { auth.setPassword(body.next); } catch (e) { throw new HttpError(400, e.message); }
      const r = auth.login(ip(req), body.next);
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie(r.token) });
    }

    /* --- الانضمام من الهاتف --- */
    if (seg[0] === 'join') {
      if (m === 'GET' && seg[1]) {
        const s = sessions.byCode(seg[1]);
        if (!s) throw new HttpError(404, 'رمز الجلسة غير صحيح أو انتهت الجلسة');
        return send(res, 200, { sessionId: s.id, name: s.name, answerMode: s.answerMode, teams: s.teams.map((t) => ({ id: t.id, name: t.name, color: t.color })) });
      }
      if (m === 'POST') {
        try { return send(res, 200, sessions.join(body.code, body.name, body.teamId)); } catch (e) { throw new HttpError(400, e.message); }
      }
    }

    /* --- الجلسات --- */
    if (seg[0] === 'sessions') {
      const s = seg[1] ? sessions.get(seg[1]) : null;
      if (seg[1] && !s) throw new HttpError(404, 'الجلسة غير موجودة');
      if (seg[2] === 'stream' && m === 'GET') {
        let role = 'display', playerId = null;
        const token = url.searchParams.get('token');
        if (url.searchParams.get('role') === 'host') { requireAdmin(req); role = 'host'; }
        else if (token) { const pl = sessions.playerBy(s, token); if (!pl) throw new HttpError(403, 'رمز المشارك غير صالح'); role = 'player'; playerId = pl.id; }
        else if (url.searchParams.get('code') !== s.code) throw new HttpError(403, 'رمز الجلسة غير صحيح');
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('retry: 2000\n\n');
        const off = sessions.subscribe(s, res, role, playerId);
        req.on('close', off);
        return;
      }
      if (seg[2] === 'answer' && m === 'POST') {
        try { return send(res, 200, sessions.answer(s.id, body.token, body.answer)); } catch (e) { throw new HttpError(400, e.message); }
      }
      if (seg[2] === 'bet' && m === 'POST') {
        try { return send(res, 200, { bet: sessions.bet(s.id, body.token, body.amount) }); } catch (e) { throw new HttpError(400, e.message); }
      }
      requireAdmin(req);
      if (!seg[1] && m === 'GET') return send(res, 200, sessions.list());
      if (!seg[1] && m === 'POST') {
        let rounds = body.rounds;
        if (body.competitionId) { const c = db.get('competitions', body.competitionId); if (c) rounds = c.rounds; }
        try { const ns = sessions.create({ ...body, rounds }); return send(res, 200, { id: ns.id, code: ns.code }); } catch (e) { throw new HttpError(400, e.message); }
      }
      if (seg[2] === 'action' && m === 'POST') {
        try { sessions.action(s.id, body); return send(res, 200, sessions.view(s, 'host')); } catch (e) { throw new HttpError(400, e.message); }
      }
      if (!seg[2] && m === 'GET') return send(res, 200, sessions.view(s, 'host'));
      if (!seg[2] && m === 'DELETE') { sessions.remove(s.id); return send(res, 200, { ok: true }); }
    }

    /* --- الإدارة --- */
    if (seg[0] === 'admin') {
      requireAdmin(req);
      const [, a1, a2, a3] = seg;

      if (a1 === 'overview' && m === 'GET') {
        const d = db.data;
        return send(res, 200, {
          counts: counts(), conflicts: kb.conflicts().length, settings: d.settings,
          pending: {
            persons: d.persons.filter((x) => x.status === 'review' || x.status === 'draft').length,
            claims: d.claims.filter((x) => x.status === 'review' || x.status === 'draft').length,
            questions: d.questions.filter((x) => x.status === 'review' || x.status === 'draft').length,
            imports: d.imports.filter((x) => !x.applied).length,
            unsourcedApproved: d.claims.filter((x) => x.status === 'approved' && !x.demo && !(x.citations || []).length).length,
          },
          lan: lanAddresses(port),
        });
      }
      if (a1 === 'conflicts' && m === 'GET') return send(res, 200, kb.conflicts());
      if (a1 === 'settings' && m === 'PUT') {
        const allowed = pick(body, ['demoInPlay', 'platformName']);
        Object.assign(db.data.settings, allowed); db.save();
        return send(res, 200, db.data.settings);
      }

      if (a1 === 'generate' && m === 'POST') {
        const qs = generate(kb, { modes: body.modes, limitPerMode: Math.min(50, parseInt(body.limitPerMode, 10) || 10) });
        // المحتوى المولد يبقى مسودة دائمًا — لا نشر تلقائي
        qs.forEach((q) => { q.status = 'draft'; });
        db.insertMany('questions', qs, 'q');
        const byMode = qs.reduce((acc, q) => { acc[q.mode] = (acc[q.mode] || 0) + 1; return acc; }, {});
        return send(res, 200, { created: qs.length, byMode });
      }

      if (a1 === 'import' && m === 'POST') return send(res, 200, await doImport(body));
      if (a1 === 'imports' && a2 && a3 === 'decide' && m === 'POST') {
        const imp = db.get('imports', a2);
        if (!imp) throw new HttpError(404, 'الاستيراد غير موجود');
        for (const dcs of body.decisions || [body]) {
          const it = imp.items[dcs.index];
          if (!it || it.applied) continue;
          if (!['new', 'merge', 'skip', 'pending'].includes(dcs.decision)) throw new HttpError(400, 'قرار غير صالح');
          if (dcs.decision === 'merge' && !db.get('persons', dcs.personId || it.personId)) throw new HttpError(400, 'حدد العلم المراد الدمج معه');
          it.decision = dcs.decision;
          if (dcs.personId) it.personId = dcs.personId;
          if (dcs.name) it.name = String(dcs.name).trim();
          if (dcs.categories) it.categories = dcs.categories;
          if (dcs.acceptedHits) it.acceptedHits = dcs.acceptedHits;
        }
        db.update('imports', imp.id, { items: imp.items });
        return send(res, 200, imp);
      }
      if (a1 === 'imports' && a2 && a3 === 'apply' && m === 'POST') {
        const imp = db.get('imports', a2);
        if (!imp) throw new HttpError(404, 'الاستيراد غير موجود');
        return send(res, 200, applyImport(imp));
      }
      if (a1 === 'imports' && a2 && a3 === 'rematch' && m === 'POST') {
        const imp = db.get('imports', a2);
        if (!imp) throw new HttpError(404, 'الاستيراد غير موجود');
        for (const it of imp.items) if (!it.applied) {
          it.matches = names.matchPersons(it.name, db.data.persons, 3);
          it.sourceHits = names.searchDocuments(it.name, db.data.documents, (id) => db.loadDocumentText(id), 4);
        }
        db.update('imports', imp.id, { items: imp.items });
        return send(res, 200, imp);
      }

      if (a1 === 'documents' && a2 && a3 === 'pages' && m === 'GET') {
        const doc = db.get('documents', a2);
        if (!doc) throw new HttpError(404, 'المستند غير موجود');
        const pages = db.loadDocumentText(a2);
        const q = AR.normalize(url.searchParams.get('q') || '');
        const from = parseInt(url.searchParams.get('from'), 10) || 0;
        const list = q ? pages.map((pg, i) => ({ ...pg, i })).filter((pg) => AR.normalize(pg.text).includes(q)) : pages.map((pg, i) => ({ ...pg, i }));
        return send(res, 200, { total: list.length, pages: list.slice(from, from + 20) });
      }
      if (a1 === 'search-sources' && m === 'GET') {
        const n = url.searchParams.get('name') || '';
        return send(res, 200, names.searchDocuments(n, db.data.documents, (id) => db.loadDocumentText(id), 20));
      }
      if (a1 === 'persons' && a2 && a3 === 'full' && m === 'GET') {
        const person = db.get('persons', a2);
        if (!person) throw new HttpError(404, 'العلم غير موجود');
        return send(res, 200, {
          person, claims: db.data.claims.filter((c) => c.personId === a2), students: db.data.claims.filter((c) => c.kind === 'teacher' && c.value && c.value.personId === a2),
          conflicts: kb.conflicts().filter((c) => c.personId === a2), deathYear: kb.deathYear(a2),
          questions: db.data.questions.filter((q) => (q.refs && (q.refs.personIds || []).includes(a2))).map((q) => ({ id: q.id, prompt: q.prompt, status: q.status, mode: q.mode })),
          events: db.data.events.filter((e) => (e.personIds || []).includes(a2)),
        });
      }


      if (a1 === 'backup' && m === 'GET') {
        return send(res, 200, JSON.stringify(db.snapshot()), {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="himma-backup-' + new Date().toISOString().slice(0, 10) + '.json"',
        });
      }
      if (a1 === 'backups' && !a2 && m === 'GET') return send(res, 200, db.listBackups());
      if (a1 === 'backups' && !a2 && m === 'POST') return send(res, 200, { name: db.backupToDisk('manual') });
      if (a1 === 'backups' && a2 && a3 === 'restore' && m === 'POST') {
        const snap = db.readBackup(a2);
        if (!snap) throw new HttpError(404, 'النسخة غير موجودة');
        try { return send(res, 200, { ok: true, safety: db.restore(snap) }); } catch (e) { throw new HttpError(400, e.message); }
      }
      if (a1 === 'restore' && m === 'POST') {
        try { return send(res, 200, { ok: true, safety: db.restore(body.snapshot) }); } catch (e) { throw new HttpError(400, e.message); }
      }
      if (a1 === 'export' && a2 && m === 'GET') {
        const kind = a2.replace(/\.csv$/, '');
        return send(res, 200, exportCSV(kind), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="himma-' + kind + '.csv"' });
      }

      if (a1 === 'bulk' && m === 'POST') {
        const col = body.collection;
        if (!EDITABLE[col]) throw new HttpError(400, 'مجموعة غير معروفة');
        const ids = new Set(body.ids || []);
        let n = 0;
        if (body.delete) {
          for (const id of ids) { if (db.get(col, id)) { db.remove(col, id); cascadeDelete(col, id); n++; } }
        } else {
          const patch = pick(body.patch || {}, ['status', 'difficulty']);
          if (patch.status && !Catalog.STATUS[patch.status]) throw new HttpError(400, 'حالة غير صالحة');
          for (const x of db.data[col]) if (ids.has(x.id)) { Object.assign(x, patch, { updatedAt: new Date().toISOString() }); n++; }
          db.save();
        }
        return send(res, 200, { changed: n });
      }

      // CRUD عام
      if (EDITABLE[a1] || a1 === 'imports' || a1 === 'documents' || a1 === 'results') {
        const col = a1;
        if (m === 'GET' && !a2) return send(res, 200, db.list(col));
        if (m === 'GET' && a2) { const r = db.get(col, a2); if (!r) throw new HttpError(404, 'غير موجود'); return send(res, 200, r); }
        if (m === 'DELETE' && a2) {
          if (!db.get(col, a2)) throw new HttpError(404, 'غير موجود');
          db.remove(col, a2); cascadeDelete(col, a2);
          return send(res, 200, { ok: true });
        }
        if (!EDITABLE[col]) throw new HttpError(405, 'غير مسموح');
        const data = enrichCitations(pick(body, EDITABLE[col]));
        if (data.difficulty != null) data.difficulty = Number(data.difficulty);
        if (m === 'POST' && !a2) {
          if (col === 'questions' && !data.status) data.status = 'draft';
          if (['persons', 'claims', 'events', 'terms'].includes(col) && !data.status) data.status = 'review';
          if (col === 'questions') data.origin = 'manual';
          if (col === 'categories') data.id = 'cat_' + uid('').slice(1);
          validate(col, data);
          return send(res, 200, db.insert(col, data));
        }
        if (m === 'PUT' && a2) {
          const cur = db.get(col, a2);
          if (!cur) throw new HttpError(404, 'غير موجود');
          validate(col, { ...cur, ...data });
          // تعديل قيمة معلومة معتمدة يعيد أسئلتها للمراجعة
          if (col === 'claims' && data.value && JSON.stringify(data.value) !== JSON.stringify(cur.value)) invalidateQuestions(a2);
          // إزالة صفة «تجريبي» عند توثيق عنصر تجريبي يدويًا
          if (body.clearDemo) data.demo = false;
          return send(res, 200, db.update(col, a2, data));
        }
      }
    }
    throw new HttpError(404, 'المسار غير موجود');
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      if (res.headersSent) { try { res.end(); } catch {} return; }
      const code = e instanceof HttpError ? e.code : 500;
      if (code === 500) console.error(e);
      send(res, code, { error: code === 500 ? 'خطأ داخلي في الخادم' : e.message });
    });
  });
  server.on('listening', () => { port = server.address().port; });
  server.on('close', () => sessions.close());
  return { server, db, auth, kb, sessions };
}

module.exports = { createApp };
