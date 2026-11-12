'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AR = require('../../shared/arabic.js');
const Engine = require('../../shared/engine.js');
const importers = require('../../server/importers.js');
const names = require('../../server/names.js');
const { DB } = require('../../server/db.js');
const { KB, shamelaUrl } = require('../../server/kb.js');
const { generate } = require('../../server/generator.js');
const demo = require('../../server/demo.js');
const { makeXlsx, makeDocx, makePdf, tmpDir } = require('./helpers.js');

test('تطبيع العربية ومفتاح الأسماء والتشابه', () => {
  assert.equal(AR.normalize('أَحْمَدُ بنُ حَنْبَلٍ'), 'احمد بن حنبل');
  assert.equal(AR.nameKey('الإمام أحمد بن حنبل رحمه الله'), 'احمد بن حنبل');
  assert.equal(AR.similarity('الإمام البخاري', 'البُخاري'), 1);
  assert.ok(AR.similarity('محمد بن إسماعيل البخاري', 'البخاري') >= 0.85);
  assert.ok(AR.similarity('مالك بن أنس', 'ابن تيمية') < 0.5);
  assert.equal(AR.century(256), 3);
  assert.equal(AR.century(100), 1);
  assert.equal(AR.century(101), 2);
  assert.equal(AR.centuryName(3), 'القرن الثالث الهجري');
  assert.equal(AR.toLatinDigits('٢٥٦'), '256');
  assert.equal(AR.placePhrase('ارتبط اسمه ب', 'بغداد'), 'ارتبط اسمه ببغداد');
});

test('رابط الشاملة لا يُبنى إلا من رقم صالح', () => {
  assert.equal(shamelaUrl(1681, 12), 'https://shamela.ws/book/1681/12');
  assert.equal(shamelaUrl('abc', 1), null);
  assert.equal(shamelaUrl(5), 'https://shamela.ws/book/5');
});

test('المحرك: التهيئة والتصحيح والإخفاء لكل نوع', () => {
  const qs = [
    { type: 'choice', difficulty: 1, data: { options: ['a', 'b', 'c', 'd'], answer: 0 } },
    { type: 'reveal', difficulty: 2, data: { clues: ['1', '2', '3'], options: ['a', 'b', 'c', 'd'], answer: 0 } },
    { type: 'card', difficulty: 2, data: { segments: [{ label: 'x', value: 'y' }], options: ['a', 'b', 'c', 'd'], answer: 0 } },
    { type: 'order', difficulty: 2, data: { items: [{ label: 'a', value: 10 }, { label: 'b', value: 20 }, { label: 'c', value: 30 }, { label: 'd', value: 40 }] } },
    { type: 'match', difficulty: 2, data: { left: ['a', 'b', 'c'], right: ['1', '2', '3'] } },
    { type: 'bucket', difficulty: 2, data: { buckets: ['x', 'y'], items: [{ label: 'a', bucket: 0 }, { label: 'b', bucket: 1 }] } },
    { type: 'spot', difficulty: 2, data: { statements: ['w', 't1', 't2'], wrong: 0, correction: 'c' } },
  ];
  for (const raw of qs) {
    for (let seed = 0; seed < 5; seed++) {
      const q = Engine.prepare(raw, seed);
      const d = q.data;
      const correct = {
        choice: d.answer, reveal: { choice: d.answer, used: 1 }, card: { choice: d.answer, revealed: 0 },
        order: q.type === 'order' ? Engine.orderKey(q) : null, match: d.key, bucket: d.items && d.items.map((it) => it.bucket), spot: d.wrong,
      }[q.type];
      assert.equal(Engine.grade(q, correct).fraction, 1, q.type + ' correct answer should score 1');
      const s = Engine.strip(q);
      assert.equal(s.data.answer, undefined);
      assert.equal(s.data.key, undefined);
      assert.equal(s.data.wrong, undefined);
      if (s.data.items) assert.ok(s.data.items.every((it) => it.value === undefined && it.bucket === undefined));
    }
  }
  // الترتيب المخلوط لا يطابق الأصل
  const o = Engine.prepare(qs[3], 1);
  assert.notDeepEqual(o.data.items.map((x) => x.value), [10, 20, 30, 40]);
  // درجات جزئية
  const m = Engine.prepare(qs[4], 3);
  const half = m.data.key.slice(); [half[0], half[1]] = [half[1], half[0]];
  assert.ok(Engine.grade(m, half).fraction < 1);
  assert.equal(Engine.grade(qs[0], null).fraction, 0);
  // نص الإجابة يعمل على السؤال الخام (كما في بنك الأسئلة) وعلى المهيأ
  for (const raw of qs) { assert.ok(Engine.answerText(raw)); assert.ok(Engine.answerText(Engine.prepare(raw, 2))); }
  assert.equal(Engine.answerText(qs[4]), 'a ↔ 1، b ↔ 2، c ↔ 3');
});

test('حساب النقاط: الصعوبة والتلميحات والسرعة', () => {
  const q = { type: 'choice', difficulty: 2, data: {} };
  assert.equal(Engine.points(q, 1), 200);
  assert.equal(Engine.points(q, 1, { multiplier: 2 }), 400);
  assert.equal(Engine.points(q, 1, { speedFactor: 1 }), 300);
  assert.equal(Engine.points(q, 0), 0);
  const r = { type: 'reveal', difficulty: 1 };
  assert.equal(Engine.points(r, 1, { answer: { used: 1 } }), 100);
  assert.equal(Engine.points(r, 1, { answer: { used: 3 } }), 60);
  const c = { type: 'card', difficulty: 3 };
  assert.equal(Engine.points(c, 1, { answer: { revealed: 2 } }), 210);
  assert.equal(Engine.points({ type: 'order', difficulty: 1 }, 0.25), 0);
});

test('الاستيراد: CSV بعلامات اقتباس وفاصلة عربية', async () => {
  const r = await importers.parseFile('a.csv', Buffer.from('﻿الاسم,الوفاة\n"البخاري، صاحب الصحيح",256\nمسلم,261\n'));
  assert.deepEqual(r.rows[1], ['البخاري، صاحب الصحيح', '256']);
  const r2 = importers.parseCSV('الاسم،الوفاة\nمالك،179');
  assert.deepEqual(r2[1], ['مالك', '179']);
});

test('الاستيراد: XLSX و DOCX و JSON و HTML و PDF', async () => {
  const x = await importers.parseFile('n.xlsx', makeXlsx([['الاسم', 'سنة الوفاة'], ['أحمد بن حنبل', 241], ['الشافعي', 204]]));
  assert.deepEqual(x.rows, [['الاسم', 'سنة الوفاة'], ['أحمد بن حنبل', '241'], ['الشافعي', '204']]);
  const d = await importers.parseFile('n.docx', makeDocx(['المحدثون:', '1- البخاري', '2- مسلم']));
  assert.equal(d.rows.length, 3);
  const j = await importers.parseFile('n.json', Buffer.from(JSON.stringify([{ name: 'مالك', death: 179 }])));
  assert.deepEqual(j.rows, [['name', 'death'], ['مالك', '179']]);
  const h = await importers.parseFile('n.html', Buffer.from('<p>الحسن البصري</p><p>سفيان الثوري</p>'));
  assert.deepEqual(h.rows.map((r) => r[0]), ['الحسن البصري', 'سفيان الثوري']);
  const p = await importers.parseFile('n.pdf', makePdf('Hello Himma'));
  assert.equal(p.pages.length, 1);
  assert.match(p.pages[0].text, /Hello Himma/);
  assert.ok(p.warnings.some((w) => w.includes('ترتيب صفحات الملف')));
});

test('الاستيراد: رفض الصيغ غير المدعومة والملفات التالفة برسالة واضحة', async () => {
  await assert.rejects(importers.parseFile('a.xls', Buffer.from('x')), /xlsx/);
  await assert.rejects(importers.parseFile('a.exe', Buffer.from('x')), /غير مدعومة/);
  await assert.rejects(importers.parseFile('a.txt', Buffer.alloc(0)), /فارغ/);
  await assert.rejects(importers.parseFile('a.xlsx', Buffer.from('not a zip')), /تالف/);
  await assert.rejects(importers.parseFile('a.json', Buffer.from('{bad')), /JSON/);
  await assert.rejects(importers.parseFile('a.pdf', Buffer.from('%PDF-broken')), /PDF/);
});

test('تقسيم نص الشاملة إلى صفحات بحسب العلامات، ودون اختراع أرقام', () => {
  const pages = importers.splitPages('نص الصفحة الأولى [ج ١ - ص ١٢] نص الثانية [ج ١ - ص ١٣] الأخير');
  assert.deepEqual(pages.slice(0, 2).map((p) => [p.vol, p.page]), [[1, 12], [1, 13]]);
  const p2 = importers.splitPages('أ [ص: 5] ب [ص: 6]');
  assert.equal(p2[0].page, 5);
  const p3 = importers.splitPages('سطر\nسطر آخر');
  assert.equal(p3[0].page, null);
});

test('الأسماء: تنظيف، عناوين أقسام، إزالة تكرار، مطابقة', () => {
  const c = names.cleanName('3- الإمام محمد بن إسماعيل البخاري (ت 256هـ)');
  assert.equal(c.name, 'الإمام محمد بن إسماعيل البخاري');
  assert.equal(c.deathHint, 256);
  assert.equal(names.cleanName('• سفيان الثوري — فقيه الكوفة').name, 'سفيان الثوري');
  const rows = [['## المحدثون'], ['1. البخاري'], ['2. مسلم بن الحجاج'], ['3. البُخاري'], [''], ['الزهاد والعباد:'], ['- الحسن البصري (ت ١١٠هـ)']];
  const cands = names.dedupe(names.extractCandidates(rows));
  assert.equal(cands.length, 3);
  assert.equal(cands[0].categoryHint, 'muhaddith');
  assert.equal(cands[0].duplicates, 1);
  assert.equal(cands[2].categoryHint, 'zahid');
  assert.equal(cands[2].deathHint, 110);
  const table = names.extractCandidates([['الاسم', 'الوفاة', 'التصنيف'], ['مالك بن أنس', '179', 'فقيه']]);
  assert.equal(table[0].deathHint, 179);
  assert.equal(table[0].categoryHint, 'faqih');
  const m = names.matchPersons('الإمام مالك', [{ id: 'p1', name: 'مالك بن أنس', aliases: ['الإمام مالك'] }, { id: 'p2', name: 'ابن ماجه' }]);
  assert.equal(m[0].personId, 'p1');
});

test('المولّد: كل سؤال يُصحح بإجابته، والمشتتات منطقية، ولا يستعمل غير المعتمد', () => {
  const db = new DB(tmpDir());
  const kb = new KB(db);
  demo.loadDemo(db, kb, generate);
  assert.ok(db.data.questions.length > 100);
  const modes = new Set(db.data.questions.map((q) => q.mode));
  for (const m of ['work-author', 'reveal', 'card', 'order-death', 'match-work', 'teacher', 'match-teacher', 'bucket-century', 'spot', 'order-event', 'map', 'shelf', 'cloze']) assert.ok(modes.has(m), 'mode ' + m);
  const deathOf = (pid) => kb.deathYear(pid);
  for (const raw of db.data.questions) {
    const q = Engine.prepare(raw, raw.id);
    const d = q.data;
    const ans = { choice: d.answer, reveal: { choice: d.answer, used: 1 }, card: { choice: d.answer }, order: q.type === 'order' && Engine.orderKey(q), match: d.key, bucket: d.items && d.items.map((i) => i.bucket), spot: d.wrong }[q.type];
    assert.equal(Engine.grade(q, ans).fraction, 1, raw.prompt);
    if (d.options) assert.equal(new Set(d.options).size, d.options.length, 'خيارات مكررة: ' + raw.prompt);
    if (raw.mode === 'teacher') {
      // مشتتات سؤال الشيخ يستحيل زمنيًا أن يكونوا من شيوخه
      const student = raw.refs.personIds[0];
      const sy = deathOf(student);
      for (const opt of raw.data.options.slice(1)) {
        const p = db.data.persons.find((x) => x.name === opt);
        const y = deathOf(p.id);
        assert.ok(y < sy - 120 || y > sy + 60, opt + ' distractor timing');
      }
    }
  }
  // عاصم: روايتان متعارضتان قيد المراجعة ← لا سنة وفاة ثابتة، ويظهر التعارض للمشرف
  assert.equal(kb.deathYear('demo_asim'), null);
  assert.ok(kb.conflicts().some((c) => c.personId === 'demo_asim'));
  // اليرموك (تاريخان) لا تدخل الترتيب الزمني
  assert.ok(!db.data.questions.some((q) => q.mode === 'order-event' && q.refs.eventIds.includes('demo_ev_yarmuk')));
  // بعد إخفاء التجريبي لا يبقى شيء قابل للعب
  db.data.settings.demoInPlay = false;
  assert.equal(db.data.questions.filter((q) => kb.usable(q)).length, 0);
  assert.equal(generate(kb, { seed: 1 }).length, 0);
});

test('المولّد: التوليد الجديد مسودة، ولا يكرر سؤالًا موجودًا', () => {
  const db = new DB(tmpDir());
  const kb = new KB(db);
  demo.loadDemo(db, kb, generate);
  const again = generate(kb, { seed: 1446, limitPerMode: 14 });
  const sigs = new Set(db.data.questions.map((q) => q.signature));
  assert.ok(again.every((q) => !sigs.has(q.signature)));
  assert.ok(again.every((q) => q.status === 'draft'));
});

test('حذف البيانات التجريبية يزيلها كلها ويبقي المصادر المرجعية', () => {
  const db = new DB(tmpDir());
  const kb = new KB(db);
  demo.loadDemo(db, kb, generate);
  db.insert('persons', { name: 'علم حقيقي', status: 'review' });
  demo.removeDemo(db);
  assert.equal(db.data.persons.length, 1);
  assert.equal(db.data.questions.length, 0);
  assert.ok(db.data.sources.length > 0);
});

test('النسخ الاحتياطي: لقطة واستعادة مع نسخة أمان', () => {
  const db = new DB(tmpDir());
  db.insert('persons', { name: 'أ', status: 'review' });
  db.saveDocumentText('doc1', [{ page: 1, text: 'نص' }]);
  db.data.documents.push({ id: 'doc1', title: 'ك' }); db.save();
  const snap = db.snapshot();
  db.insert('persons', { name: 'ب' });
  const safety = db.restore(snap);
  assert.ok(safety.includes('before-restore'));
  assert.equal(db.data.persons.length, 1);
  assert.equal(db.loadDocumentText('doc1')[0].text, 'نص');
  assert.throws(() => db.restore({ kind: 'other' }), /ليس نسخة/);
});
