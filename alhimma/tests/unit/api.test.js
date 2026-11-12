'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createApp } = require('../../server/app.js');
const { tmpDir, makeXlsx } = require('./helpers.js');

let app, base, cookie = '';

function req(method, path, body, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request(base + path, {
      method, headers: { ...(data ? { 'Content-Type': opts.ctype || 'application/json', 'Content-Length': data.length } : {}), ...(opts.noCookie ? {} : { Cookie: cookie }) },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        const sc = res.headers['set-cookie'];
        if (sc && !opts.noCookie) cookie = sc[0].split(';')[0];
        let json = null; try { json = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, body: json, text: buf, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

test.before(async () => {
  app = createApp({ dataDir: tmpDir() });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + app.server.address().port;
});
test.after(() => new Promise((r) => app.server.close(r)));

test('الصفحات والملفات الثابتة، ومنع الخروج من المجلد', async () => {
  for (const p of ['/', '/play', '/host', '/join', '/admin', '/css/himma.css', '/shared/engine.js', '/fonts/kufi/noto-kufi-arabic-arabic-700-normal.woff2']) {
    assert.equal((await req('GET', p)).status, 200, p);
  }
  assert.ok([403, 404].includes((await req('GET', '/..%2f..%2fserver.js')).status));
  assert.equal((await req('GET', '/shared/..%2f..%2fpackage.json')).status, 404);
  const home = await req('GET', '/');
  assert.match(home.headers['content-security-policy'], /default-src 'self'/);
});

test('حماية الإدارة: 401 دون دخول، ورفض الطلبات غير JSON، وحد محاولات الدخول', async () => {
  assert.equal((await req('GET', '/api/admin/overview')).status, 401);
  assert.equal((await req('POST', '/api/sessions', { teams: ['أ'] })).status, 401);
  const st = await req('GET', '/api/status');
  assert.equal(st.body.configured, false);
  assert.equal((await req('POST', '/api/auth/setup', { password: 'short' })).status, 400);
  assert.equal((await req('POST', '/api/auth/setup', { password: 'himma-pass-1' })).status, 200);
  assert.equal((await req('POST', '/api/auth/setup', { password: 'another-pass' })).status, 409);
  assert.equal((await req('GET', '/api/admin/overview')).status, 200);
  assert.equal((await req('POST', '/api/admin/generate', {}, { ctype: 'text/plain' })).status, 415);
  // محاولات خاطئة متتالية تُحظر
  for (let i = 0; i < 5; i++) await req('POST', '/api/auth/login', { password: 'wrong' }, { noCookie: true });
  const blocked = await req('POST', '/api/auth/login', { password: 'himma-pass-1' }, { noCookie: true });
  assert.equal(blocked.status, 401);
  assert.match(blocked.body.error, /محاولات كثيرة/);
});

test('لا اتصال بالمكتبة الشاملة: مسارات الربط غير موجودة', async () => {
  assert.equal((await req('GET', '/api/admin/shamela/status')).status, 404);
  assert.equal((await req('POST', '/api/admin/shamela/check', { url: 'https://shamela.ws/' })).status, 404);
});

test('بطاقة العلم العامة: المعتمد فقط مع إحالته، وعدد ما يحتاج مراجعة', async () => {
  const r = await req('GET', '/api/persons/t5_musa');
  assert.equal(r.status, 200);
  assert.ok(r.body.facts.some((f) => f.text.includes('العبد الصالح')));
  assert.ok(!r.body.facts.some((f) => f.text.includes('ثلاثمائة') || f.text.includes('بغداد')));
  assert.equal(r.body.underReview, 2);
  assert.equal(r.body.citations[0].url, 'https://shamela.ws/book/10906/4520');
  const cat = await req('GET', '/api/catalog');
  assert.equal(cat.body.persons.length, 10);
  assert.equal(cat.body.persons.find((p) => p.id === 't5_ayli').deathText, 'نحو 152–160هـ');
});

test('اللعب الفردي يعرض المعتمد فقط ويستثني المكرر', async () => {
  const r = await req('GET', '/api/play/questions?modes=reveal&count=5');
  assert.equal(r.body.questions.length, 5);
  const all = app.db.data.questions;
  for (const q of r.body.questions) assert.equal(all.find((x) => x.id === q.id).status, 'approved');
  const ex = r.body.questions.map((q) => q.id).join(',');
  const r2 = await req('GET', '/api/play/questions?modes=reveal&count=5&exclude=' + ex);
  assert.ok(r2.body.questions.every((q) => !ex.includes(q.id)));
  // كل سؤال يحمل معلومة تعليمية أو شرحًا
  assert.ok(r.body.questions.every((q) => q.explanation && q.citations.length && q.citations[0].urlLabel === 'رابط بداية الترجمة'));
});

test('استيراد قائمة أسماء: تنظيف وتوحيد ومطابقة، ولا إضافة قبل قرار المشرف', async () => {
  const before = app.db.data.persons.length;
  const txt = '## المحدثون\n1- الإمام جعفر الصادق\n2- أبو زرعة الرازي (ت 264هـ)\n3- أبو زرعة الرازي\n\nالزهاد:\n- بشر الحافي\n';
  const r = await req('POST', '/api/admin/import', { filename: 'names.txt', contentBase64: Buffer.from(txt).toString('base64'), kind: 'names' });
  assert.equal(r.status, 200);
  const imp = r.body.import;
  assert.equal(imp.items.length, 3);
  assert.equal(imp.duplicatesRemoved, 1);
  assert.equal(app.db.data.persons.length, before, 'لا يُضاف أحد قبل القرار');
  const jafar = imp.items.find((i) => i.name.includes('جعفر'));
  assert.equal(jafar.matches[0].personId, 't5_jafar');
  assert.equal(jafar.decision, 'merge');
  const abuZura = imp.items.find((i) => i.name.includes('زرعة'));
  assert.equal(abuZura.deathHint, 264);
  assert.equal(abuZura.categoryHint, 'muhaddith');
  const decisions = imp.items.map((it, index) => ({ index, decision: it.name.includes('جعفر') ? 'merge' : 'new', personId: it.matches[0] ? it.matches[0].personId : null }));
  assert.equal((await req('POST', '/api/admin/imports/' + imp.id + '/decide', { decisions })).status, 200);
  const ap = await req('POST', '/api/admin/imports/' + imp.id + '/apply', {});
  assert.equal(ap.body.created, 2);
  const created = app.db.data.persons.filter((p) => p.importId === imp.id);
  assert.ok(created.every((p) => p.status === 'review' && !p.demo));
  const dz = app.db.data.claims.find((c) => c.personId === created.find((p) => p.name.includes('زرعة')).id && c.kind === 'death');
  assert.equal(dz.status, 'draft', 'سنة الوفاة من القائمة مسودة تحتاج توثيقًا');
});

test('استيراد Excel وملف بصيغة غير مدعومة', async () => {
  const x = makeXlsx([['الاسم', 'الوفاة'], ['معروف الكرخي', 200]]);
  const r = await req('POST', '/api/admin/import', { filename: 'a.xlsx', contentBase64: x.toString('base64'), kind: 'names' });
  assert.equal(r.status, 200);
  assert.equal(r.body.import.items[0].deathHint, 200);
  const bad = await req('POST', '/api/admin/import', { filename: 'a.xls', contentBase64: 'AAAA', kind: 'names' });
  assert.equal(bad.status, 422);
  assert.match(bad.body.error, /xlsx/);
});

test('استيراد نص مصدر بعلامات الصفحات، والبحث عن اسم فيه', async () => {
  const text = 'ترجمة أبي زرعة الرازي الحافظ [ج ١ - ص ٣٣] كلام آخر عن غيره [ج ١ - ص ٣٤]';
  const r = await req('POST', '/api/admin/import', { filename: 'kitab.txt', contentBase64: Buffer.from(text).toString('base64'), kind: 'source', title: 'كتاب تجريبي للاختبار', author: 'مؤلف' });
  assert.equal(r.status, 200);
  assert.equal(r.body.document.pagesCount, 2);
  assert.ok(r.body.document.hasPageNumbers);
  const hits = await req('GET', '/api/admin/search-sources?name=' + encodeURIComponent('أبو زرعة الرازي'));
  assert.equal(hits.body[0].page, 33);
  assert.equal(hits.body[0].vol, 1);
});

test('اعتماد معلومة بلا قيمة صحيحة يُرفض، وتعديل معلومة معتمدة يعيد أسئلتها للمراجعة', async () => {
  assert.equal((await req('POST', '/api/admin/claims', { personId: 'nope', kind: 'death', value: { year: 1 } })).status, 400);
  assert.equal((await req('POST', '/api/admin/claims', { personId: 't5_jafar', kind: 'bad' })).status, 400);
  const claimId = app.db.data.claims.find((c) => c.personId === 't5_jafar' && c.kind === 'birth').id;
  const q = (await req('POST', '/api/admin/questions', { mode: 'cloze', type: 'choice', prompt: 'متى ولد جعفر؟', data: { options: ['80هـ', '90هـ'], answer: 0 }, refs: { personIds: ['t5_jafar'], claimIds: [claimId] }, status: 'approved' })).body;
  assert.equal((await req('POST', '/api/admin/claims', { personId: 't5_jafar', kind: 'death', value: { year: 1 }, citations: [{ pages: 'abc' }] })).status, 400);
  const r = await req('PUT', '/api/admin/claims/' + claimId, { value: { year: 81 } });
  assert.equal(r.status, 200);
  assert.equal(app.db.data.questions.find((x) => x.id === q.id).status, 'review');
});

test('توليد الأسئلة من الإدارة ينتج مسودات فقط', async () => {
  const before = new Set(app.db.data.questions.map((q) => q.id));
  const r = await req('POST', '/api/admin/generate', { limitPerMode: 3 });
  assert.equal(r.status, 200);
  const fresh = app.db.data.questions.filter((q) => !before.has(q.id));
  assert.equal(fresh.length, r.body.created);
  assert.ok(fresh.every((q) => q.status === 'draft'));
});

test('مسابقة جماعية كاملة: انضمام، إجابة، كشف، إيقاف، إلغاء، تعديل، إنهاء', async () => {
  const c = await req('POST', '/api/sessions', { name: 'اختبار', answerMode: 'phones', teams: ['الأول', 'الثاني'], rounds: [{ type: 'speed', count: 2, difficulty: [1, 2, 3] }, { type: 'risk', count: 1 }] });
  assert.equal(c.status, 200);
  const { id, code } = c.body;
  assert.match(code, /^\d{4}$/);
  const info = await req('GET', '/api/join/' + code);
  assert.equal(info.body.teams.length, 2);
  assert.equal((await req('POST', '/api/join', { code: '0000', name: 'x', teamId: 't1' })).status, 400);
  const p1 = (await req('POST', '/api/join', { code, name: 'سالم', teamId: 't1' })).body;
  const p2 = (await req('POST', '/api/join', { code, name: 'خالد', teamId: 't2' })).body;
  const act = (type, extra) => req('POST', '/api/sessions/' + id + '/action', { type, ...(extra || {}) });

  assert.equal((await req('POST', '/api/sessions/' + id + '/answer', { token: p1.token, answer: 0 })).status, 400); // قبل البدء
  let v = (await act('start')).body;
  assert.equal(v.phase, 'intro');
  v = (await act('next')).body;
  assert.equal(v.phase, 'question');
  const s = app.sessions.get(id);
  const q = s.current.q;
  const right = q.type === 'choice' ? q.data.answer : q.type === 'spot' ? q.data.wrong : { choice: q.data.answer, used: 1 };
  const wrongA = q.type === 'choice' ? (q.data.answer + 1) % q.data.options.length : q.type === 'spot' ? (q.data.wrong + 1) % q.data.statements.length : { choice: (q.data.answer + 1) % 4 };
  // المشارك لا يرى الإجابة
  assert.equal(app.sessions.view(s, 'player', p1.playerId).current.q.data.answer, undefined);
  // الإيقاف المؤقت يمنع الإجابة ثم الاستئناف
  await act('pause');
  assert.equal((await req('POST', '/api/sessions/' + id + '/answer', { token: p1.token, answer: right })).status, 400);
  await act('resume');
  assert.equal((await req('POST', '/api/sessions/' + id + '/answer', { token: p1.token, answer: right })).status, 200);
  assert.equal((await req('POST', '/api/sessions/' + id + '/answer', { token: p1.token, answer: right })).status, 400); // مرة واحدة للفريق
  await req('POST', '/api/sessions/' + id + '/answer', { token: p2.token, answer: wrongA });
  assert.equal(s.phase, 'locked'); // أجابت كل الفرق
  v = (await act('next')).body;
  assert.equal(v.phase, 'revealed');
  const t1 = s.teams.find((t) => t.id === 't1'), t2 = s.teams.find((t) => t.id === 't2');
  assert.ok(t1.score > 0);
  assert.equal(t2.score, 0);
  assert.ok(v.current.answerText);
  // إلغاء السؤال يعيد النقاط
  await act('cancel');
  assert.equal(t1.score, 0);
  // تعديل يدوي
  await act('adjust', { teamId: 't2', delta: 150, reason: 'سؤال شفهي' });
  assert.equal(t2.score, 150);
  // السؤال الثاني: تجاوز
  await act('next');
  await act('skip');
  // جولة المخاطرة
  assert.equal(s.phase, 'intro');
  await act('next');
  assert.equal(s.phase, 'betting');
  assert.equal((await req('POST', '/api/sessions/' + id + '/bet', { token: p2.token, amount: 9999 })).body.bet, 150); // لا يتجاوز الرصيد
  await act('next');
  const rq = s.current.q;
  const rRight = rq.type === 'choice' ? rq.data.answer : rq.type === 'spot' ? rq.data.wrong : null;
  if (rRight != null) {
    await req('POST', '/api/sessions/' + id + '/answer', { token: p2.token, answer: rRight });
    await act('reveal');
    assert.equal(t2.score, 300);
  } else await act('reveal');
  // الحفظ على القرص والاستعادة بعد إعادة التشغيل
  const saved = app.db.loadSessions().find((x) => x.id === id);
  assert.equal(saved.teams.find((t) => t.id === 't2').score, t2.score);
  await act('end');
  assert.equal(s.phase, 'finished');
  const res = app.db.data.results.find((r) => r.sessionId === id);
  assert.ok(res && res.winners.length >= 1);
  const csv = await req('GET', '/api/admin/export/results.csv');
  assert.match(csv.text, /اختبار/);
  assert.equal((await req('GET', '/api/join/' + code)).status, 404); // الجلسة انتهت
});

test('وضع الشاشة الواحدة: إجابة الفريق صاحب الدور على الشاشة', async () => {
  const c = await req('POST', '/api/sessions', { answerMode: 'screen', teams: ['أ', 'ب'], rounds: [{ type: 'speed', count: 1 }] });
  const id = c.body.id;
  await req('POST', '/api/sessions/' + id + '/action', { type: 'start' });
  await req('POST', '/api/sessions/' + id + '/action', { type: 'next' });
  const s = app.sessions.get(id);
  const q = s.current.q;
  const ans = q.type === 'choice' ? q.data.answer : q.type === 'spot' ? q.data.wrong : { choice: q.data.answer, used: 1 };
  await req('POST', '/api/sessions/' + id + '/action', { type: 'turn', teamId: 't2' });
  const v = (await req('POST', '/api/sessions/' + id + '/action', { type: 'screenAnswer', answer: ans })).body;
  assert.equal(v.phase, 'revealed');
  assert.ok(s.teams.find((t) => t.id === 't2').score > 0);
});

test('النسخ الاحتياطي عبر الواجهة والاستعادة', async () => {
  const b = await req('GET', '/api/admin/backup');
  const snap = JSON.parse(b.text);
  assert.equal(snap.kind, 'himma-backup');
  const n = app.db.data.persons.length;
  await req('POST', '/api/admin/persons', { name: 'علم مؤقت' });
  assert.equal(app.db.data.persons.length, n + 1);
  const r = await req('POST', '/api/admin/restore', { snapshot: snap });
  assert.equal(r.status, 200);
  assert.equal(app.db.data.persons.length, n);
  assert.equal((await req('POST', '/api/admin/restore', { snapshot: { kind: 'x' } })).status, 400);
});

test('ألعاب الإصدار: لكل لعبة أسئلة معتمدة', async () => {
  const cat = (await req('GET', '/api/catalog')).body;
  for (const g of cat.GAMES) {
    const r = await req('GET', '/api/play/questions?count=3&modes=' + g.modes.join(','));
    assert.ok(r.body.questions.length >= 2, g.title);
  }
});
