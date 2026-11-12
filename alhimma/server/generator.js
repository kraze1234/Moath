'use strict';
/* توليد مسودات الأسئلة من المعلومات المعتمدة فقط.
 * كل ما يولده النظام يُحفظ "مسودة" ولا يظهر في اللعب قبل اعتماد المشرف. */
const AR = require('../shared/arabic.js');
const Catalog = require('../shared/catalog.js');
const Engine = require('../shared/engine.js');
const { claimText } = require('./kb.js');

const ar = AR.toArabicDigits;
const clamp = (n) => Math.max(1, Math.min(3, Math.round(n)));

function generate(kb, opts) {
  opts = opts || {};
  const rng = Engine.rngFrom(opts.seed == null ? Date.now() : opts.seed);
  const shuffle = (a) => Engine.shuffle(a, rng);
  const limit = opts.limitPerMode || 12;
  const modes = opts.modes && opts.modes.length ? opts.modes : Object.keys(Catalog.MODES);
  const existing = new Set(kb.db.data.questions.map((q) => q.signature).filter(Boolean));
  const catNames = Object.fromEntries(kb.db.data.categories.map((c) => [c.id, c.name]));
  const d = kb.db.data;

  const persons = kb.persons();
  const profiles = persons.map((p) => kb.profile(p));
  const byId = Object.fromEntries(profiles.map((pr) => [pr.person.id, pr]));
  const personsById = Object.fromEntries(d.persons.map((p) => [p.id, p]));
  const events = d.events.filter((e) => kb.usable(e));
  const places = Object.fromEntries(d.places.map((p) => [p.id, p]));

  const level = (pr) => (pr && pr.person.level) || 2;
  const cats = (prs) => [...new Set(prs.flatMap((pr) => pr.person.categories || [pr.person.primaryCategory]).filter(Boolean))];
  const isDemo = (...xs) => xs.flat().some((x) => x && x.demo);
  const sameCat = (pr, other) => (other.person.categories || []).some((c) => (pr.person.categories || []).includes(c));

  const out = [];
  const add = (mode, q) => {
    const sig = mode + ':' + q.sigKey;
    if (existing.has(sig)) return false;
    existing.add(sig);
    delete q.sigKey;
    out.push({
      mode, type: Catalog.MODES[mode].style ? Catalog.MODES[mode].type : Catalog.MODES[mode].type,
      style: Catalog.MODES[mode].style || null, status: 'draft', origin: 'generated', signature: sig, ...q,
    });
    return true;
  };

  /** اختيار مشتتات: أعلام من التصنيف نفسه أولًا */
  function distractors(pr, n, filter) {
    const pool = profiles.filter((o) => o.person.id !== pr.person.id && (!filter || filter(o)));
    const same = shuffle(pool.filter((o) => sameCat(pr, o)));
    const rest = shuffle(pool.filter((o) => !sameCat(pr, o)));
    const seen = new Set([AR.nameKey(pr.person.name)]);
    const res = [];
    for (const o of same.concat(rest)) {
      const k = AR.nameKey(o.person.name);
      if (seen.has(k)) continue;
      seen.add(k); res.push(o);
      if (res.length === n) break;
    }
    return res.length === n ? res : null;
  }

  const gens = {
    'work-author'() {
      let n = 0;
      for (const pr of shuffle(profiles)) for (const w of pr.works) {
        if (n >= limit) return;
        const t = AR.normalize(w.value.title);
        const ds = distractors(pr, 3, (o) => !o.works.some((x) => AR.normalize(x.value.title) === t));
        if (!ds) continue;
        const opts = [pr, ...ds];
        if (add('work-author', {
          sigKey: w.id, categories: cats([pr]), difficulty: clamp(level(pr)),
          prompt: 'من مؤلف كتاب «' + w.value.title + '»؟',
          data: { options: opts.map((o) => o.person.name), answer: 0 },
          explanation: '«' + w.value.title + '» من مؤلفات ' + pr.person.name + '.',
          refs: { personIds: [pr.person.id], claimIds: [w.id] }, demo: isDemo(pr.person, w),
        })) n++;
      }
    },
    shelf() {
      let n = 0;
      for (const pr of shuffle(profiles.filter((p) => p.works.length))) {
        if (n >= limit) return;
        const w = shuffle(pr.works)[0];
        const others = shuffle(profiles.filter((o) => o.person.id !== pr.person.id).flatMap((o) => o.works.map((x) => ({ x, o }))))
          .filter((e) => !pr.works.some((m) => AR.normalize(m.value.title) === AR.normalize(e.x.value.title)));
        const uniq = [];
        for (const e of others) if (!uniq.some((u) => AR.normalize(u.x.value.title) === AR.normalize(e.x.value.title))) uniq.push(e);
        if (uniq.length < 3) continue;
        const picked = uniq.slice(0, 3);
        if (add('shelf', {
          sigKey: w.id, categories: cats([pr]), difficulty: clamp(level(pr)),
          prompt: 'ساعد أمين المكتبة: أيّ هذه الكتب من تأليف ' + pr.person.name + '؟',
          data: { options: [w.value.title, ...picked.map((e) => e.x.value.title)], answer: 0 },
          explanation: '«' + w.value.title + '» من مؤلفات ' + pr.person.name + '. أما ' + picked.map((e) => '«' + e.x.value.title + '» فل' + e.o.person.name).join('، و') + '.',
          refs: { personIds: [pr.person.id], claimIds: [w.id] }, demo: isDemo(pr.person, w, picked.map((e) => e.x)),
        })) n++;
      }
    },
    reveal() {
      let n = 0;
      for (const pr of shuffle(profiles)) {
        if (n >= limit) return;
        const clues = [], used = [];
        const cat = catNames[pr.person.primaryCategory];
        pr.traits.slice(0, 1).forEach((c) => { clues.push(c.value.text); used.push(c.id); });
        if (cat) clues.push('يُعدّ من ' + cat + '.');
        if (pr.century) clues.push('توفي في ' + AR.centuryName(pr.century) + '.');
        if (pr.madhhab) { clues.push('من أعلام المذهب ' + pr.madhhab.value.name + '.'); used.push(pr.madhhab.id); }
        if (pr.places[0]) { clues.push(AR.placePhrase(pr.places[0].value.relation, pr.places[0].value.name) + '.'); used.push(pr.places[0].id); }
        const t = pr.teachers.find((c) => personsById[c.value.personId]);
        if (t) { clues.push('من شيوخه: ' + personsById[t.value.personId].name + '.'); used.push(t.id); }
        const st = pr.students.find((c) => personsById[c.personId]);
        if (st) { clues.push('من تلاميذه: ' + personsById[st.personId].name + '.'); used.push(st.id); }
        if (pr.death) clues.push('توفي سنة ' + ar(pr.death) + 'هـ.');
        if (pr.works[0]) { clues.push('من مؤلفاته: «' + pr.works[0].value.title + '».'); used.push(pr.works[0].id); }
        if (clues.length < 3) continue;
        const ds = distractors(pr, 3);
        if (!ds) continue;
        const sel = clues.length > 5 ? clues.slice(clues.length - 5) : clues;
        if (add('reveal', {
          sigKey: pr.person.id, categories: cats([pr]), difficulty: clamp(level(pr)),
          prompt: 'من هذه الشخصية؟',
          data: { clues: sel, options: [pr, ...ds].map((o) => o.person.name), answer: 0 },
          explanation: 'إنه ' + pr.person.name + (pr.death ? ' (ت ' + ar(pr.death) + 'هـ)' : '') + '.',
          refs: { personIds: [pr.person.id], claimIds: used }, demo: isDemo(pr.person),
        })) n++;
      }
    },
    card() {
      let n = 0;
      for (const pr of shuffle(profiles)) {
        if (n >= limit) return;
        const seg = [], used = [];
        if (pr.person.primaryCategory) seg.push({ label: 'التصنيف', value: catNames[pr.person.primaryCategory] || '' });
        if (pr.century) seg.push({ label: 'العصر', value: AR.centuryName(pr.century) });
        if (pr.places[0]) { seg.push({ label: 'البلد', value: pr.places[0].value.name }); used.push(pr.places[0].id); }
        const t = pr.teachers.find((c) => personsById[c.value.personId]);
        if (t) { seg.push({ label: 'من شيوخه', value: personsById[t.value.personId].name }); used.push(t.id); }
        if (pr.madhhab) { seg.push({ label: 'المذهب', value: pr.madhhab.value.name }); used.push(pr.madhhab.id); }
        if (pr.death) seg.push({ label: 'سنة الوفاة', value: ar(pr.death) + 'هـ' });
        if (pr.works[0]) { seg.push({ label: 'من مؤلفاته', value: '«' + pr.works[0].value.title + '»' }); used.push(pr.works[0].id); }
        if (seg.length < 4) continue;
        const ds = distractors(pr, 3);
        if (!ds) continue;
        if (add('card', {
          sigKey: pr.person.id, categories: cats([pr]), difficulty: clamp(level(pr) + 0.4),
          prompt: 'بطاقة العالم المجهول: اكشف ما تحتاجه من البطاقة ثم خمّن.',
          data: { segments: seg.slice(0, 6), options: [pr, ...ds].map((o) => o.person.name), answer: 0 },
          explanation: 'صاحب البطاقة: ' + pr.person.name + '.',
          refs: { personIds: [pr.person.id], claimIds: used }, demo: isDemo(pr.person),
        })) n++;
      }
    },
    'order-death'() {
      const withYear = profiles.filter((p) => p.death);
      const groups = [];
      for (const c of Object.keys(catNames)) groups.push(withYear.filter((p) => (p.person.categories || []).includes(c)));
      groups.push(withYear); // مجموعة عامة لكل التصنيفات
      let n = 0;
      for (const g of groups) {
        for (let k = 0; k < 4 && n < limit; k++) {
          const size = k % 2 ? 5 : 4;
          const pick = [];
          for (const p of shuffle(g)) if (!pick.some((x) => x.death === p.death)) { pick.push(p); if (pick.length === size) break; }
          if (pick.length < 4) break;
          if (add('order-death', {
            sigKey: pick.map((p) => p.person.id).sort().join(','), categories: cats(pick),
            difficulty: clamp((pick.reduce((s, p) => s + level(p), 0) / pick.length) + (pick.length === 5 ? 0.5 : 0)),
            prompt: 'رتّب الأعلام بحسب سنة الوفاة: من الأقدم إلى الأحدث.',
            data: { items: pick.map((p) => ({ label: p.person.name, value: p.death, shown: 'ت ' + ar(p.death) + 'هـ' })) },
            explanation: 'الترتيب بحسب سنوات الوفاة الهجرية المعتمدة في القاعدة.',
            refs: { personIds: pick.map((p) => p.person.id), claimIds: pick.flatMap((p) => p.claims.filter((c) => c.kind === 'death').map((c) => c.id)) },
            demo: isDemo(pick.map((p) => p.person)),
          })) n++;
        }
      }
    },
    'match-work'() {
      let n = 0;
      const pool = profiles.filter((p) => p.works.length);
      for (let k = 0; k < limit * 2 && n < limit; k++) {
        const pick = shuffle(pool).slice(0, 4);
        if (pick.length < 3) return;
        const ws = pick.map((p) => shuffle(p.works)[0]);
        if (new Set(ws.map((w) => AR.normalize(w.value.title))).size < ws.length) continue;
        if (add('match-work', {
          sigKey: ws.map((w) => w.id).sort().join(','), categories: cats(pick),
          difficulty: clamp(pick.reduce((s, p) => s + level(p), 0) / pick.length),
          prompt: 'صل كل عالم بمؤلَّفه.',
          data: { left: pick.map((p) => p.person.name), right: ws.map((w) => '«' + w.value.title + '»') },
          explanation: pick.map((p, i) => '«' + ws[i].value.title + '» لـ' + p.person.name).join('، ') + '.',
          refs: { personIds: pick.map((p) => p.person.id), claimIds: ws.map((w) => w.id) }, demo: isDemo(pick.map((p) => p.person), ws),
        })) n++;
      }
    },
    teacher() {
      let n = 0;
      const rel = kb.claims(null, 'teacher').filter((c) => byId[c.personId] && byId[c.value.personId]);
      for (const c of shuffle(rel)) {
        if (n >= limit) return;
        const S = byId[c.personId], T = byId[c.value.personId];
        if (!S.death) continue;
        // مشتتات يستحيل تاريخيًا أن يكونوا من شيوخه: ماتوا قبله بأكثر من 120 سنة أو بعده بأكثر من 60
        const ds = distractors(S, 3, (o) => o.person.id !== T.person.id && o.death && (o.death < S.death - 120 || o.death > S.death + 60) &&
          !rel.some((r) => r.personId === S.person.id && r.value.personId === o.person.id));
        if (!ds) continue;
        if (add('teacher', {
          sigKey: c.id, categories: cats([S, T]), difficulty: clamp((level(S) + level(T)) / 2 + 0.3),
          prompt: 'من شيوخ ' + S.person.name + '؟',
          data: { options: [T, ...ds].map((o) => o.person.name), answer: 0 },
          explanation: S.person.name + ' تتلمذ على ' + T.person.name + '. وبقية الخيارات لا يمكن أن يكونوا من شيوخه لتباعد زمن وفاتهم عنه.',
          refs: { personIds: [S.person.id, T.person.id], claimIds: [c.id] }, demo: isDemo(c, S.person, T.person),
        })) n++;
      }
    },
    'match-teacher'() {
      let n = 0;
      const rel = kb.claims(null, 'teacher').filter((c) => byId[c.personId] && byId[c.value.personId]);
      for (let k = 0; k < limit * 3 && n < limit; k++) {
        const pick = [];
        for (const c of shuffle(rel)) {
          if (pick.some((p) => p.personId === c.personId || p.value.personId === c.value.personId ||
            p.personId === c.value.personId || p.value.personId === c.personId)) continue;
          pick.push(c);
          if (pick.length === 4) break;
        }
        if (pick.length < 3) return;
        // لا يصح أن يكون شيخ أحدهم شيخًا مثبتًا لتلميذ آخر في المجموعة
        const cross = pick.some((a) => pick.some((b) => a !== b && rel.some((r) => r.personId === b.personId && r.value.personId === a.value.personId)));
        if (cross) continue;
        if (add('match-teacher', {
          sigKey: pick.map((c) => c.id).sort().join(','), categories: cats(pick.flatMap((c) => [byId[c.personId], byId[c.value.personId]])),
          difficulty: clamp(2 + (pick.length === 4 ? 0.5 : 0)),
          prompt: 'شبكة العلماء: صل كل شيخ بتلميذه.',
          data: { left: pick.map((c) => personsById[c.value.personId].name), right: pick.map((c) => personsById[c.personId].name) },
          explanation: pick.map((c) => personsById[c.personId].name + ' تتلمذ على ' + personsById[c.value.personId].name).join('؛ ') + '.',
          refs: { personIds: pick.flatMap((c) => [c.personId, c.value.personId]), claimIds: pick.map((c) => c.id) }, demo: isDemo(pick),
        })) n++;
      }
    },
    'bucket-century'() {
      let n = 0;
      const withYear = profiles.filter((p) => p.century);
      for (let k = 0; k < limit * 3 && n < limit; k++) {
        const pick = shuffle(withYear).slice(0, 5);
        const cs = [...new Set(pick.map((p) => p.century))].sort((a, b) => a - b);
        if (pick.length < 4 || cs.length < 2 || cs.length > 4) continue;
        if (add('bucket-century', {
          sigKey: pick.map((p) => p.person.id).sort().join(','), categories: cats(pick), difficulty: clamp(1.5 + cs.length * 0.3),
          prompt: 'رحلة عبر القرون: ضع كل علم في القرن الهجري الذي توفي فيه.',
          data: { buckets: cs.map((c) => AR.centuryName(c)), items: pick.map((p) => ({ label: p.person.name, bucket: cs.indexOf(p.century) })) },
          explanation: pick.map((p) => p.person.name + ' ت ' + ar(p.death) + 'هـ').join('، ') + '.',
          refs: { personIds: pick.map((p) => p.person.id) }, demo: isDemo(pick.map((p) => p.person)),
        })) n++;
      }
    },
    'bucket-madhhab'() {
      let n = 0;
      const pool = profiles.filter((p) => p.madhhab);
      for (let k = 0; k < limit * 3 && n < limit; k++) {
        const pick = shuffle(pool).slice(0, 5);
        const ms = [...new Set(pick.map((p) => p.madhhab.value.name))];
        if (pick.length < 4 || ms.length < 2) continue;
        if (add('bucket-madhhab', {
          sigKey: pick.map((p) => p.person.id).sort().join(','), categories: ['faqih'], difficulty: clamp(2),
          prompt: 'خريطة المدارس الفقهية: ضع كل فقيه في مذهبه.',
          data: { buckets: ms, items: pick.map((p) => ({ label: p.person.name, bucket: ms.indexOf(p.madhhab.value.name) })) },
          explanation: pick.map((p) => p.person.name + ': ' + p.madhhab.value.name).join('، ') + '.',
          refs: { personIds: pick.map((p) => p.person.id), claimIds: pick.map((p) => p.madhhab.id) }, demo: isDemo(pick.map((p) => p.madhhab)),
        })) n++;
      }
    },
    spot() {
      let n = 0;
      const withYear = profiles.filter((p) => p.death);
      for (const pr of shuffle(profiles)) {
        if (n >= limit) return;
        const truths = [];
        if (pr.death) truths.push({ t: 'توفي سنة ' + ar(pr.death) + 'هـ.', k: 'death' });
        pr.works.slice(0, 2).forEach((w) => truths.push({ t: 'من مؤلفاته «' + w.value.title + '».', k: 'work', id: w.id }));
        pr.teachers.slice(0, 1).forEach((c) => personsById[c.value.personId] && truths.push({ t: 'من شيوخه ' + personsById[c.value.personId].name + '.', k: 'teacher', id: c.id }));
        if (pr.madhhab) truths.push({ t: 'من أعلام المذهب ' + pr.madhhab.value.name + '.', k: 'madhhab', id: pr.madhhab.id });
        pr.places.slice(0, 1).forEach((c) => truths.push({ t: AR.placePhrase(c.value.relation, c.value.name) + '.', k: 'place', id: c.id }));
        if (truths.length < 3) continue;
        let wrong = null;
        const kinds = shuffle(['death', 'work']);
        for (const k of kinds) {
          if (k === 'death' && pr.death) {
            const o = shuffle(withYear).find((x) => Math.abs(x.death - pr.death) >= 40);
            if (o) { wrong = { t: 'توفي سنة ' + ar(o.death) + 'هـ.', correction: 'توفي ' + pr.person.name + ' سنة ' + ar(pr.death) + 'هـ.', drop: 'death' }; break; }
          }
          if (k === 'work') {
            const titles = new Set(pr.works.map((w) => AR.normalize(w.value.title)));
            const o = shuffle(profiles.filter((x) => x.person.id !== pr.person.id && x.works.length)).map((x) => ({ x, w: x.works[0] }))
              .find((e) => !titles.has(AR.normalize(e.w.value.title)));
            if (o) { wrong = { t: 'من مؤلفاته «' + o.w.value.title + '».', correction: '«' + o.w.value.title + '» من مؤلفات ' + o.x.person.name + '.', drop: null }; break; }
          }
        }
        if (!wrong) continue;
        const keep = shuffle(truths.filter((x) => x.k !== wrong.drop)).slice(0, 3);
        if (keep.length < 3) continue;
        if (add('spot', {
          sigKey: pr.person.id + ':' + AR.normalize(wrong.t), categories: cats([pr]), difficulty: clamp(level(pr) + 0.3),
          prompt: 'صحّح الترجمة: في بطاقة ' + pr.person.name + ' معلومة واحدة خاطئة. ما هي؟',
          data: { statements: [wrong.t, ...keep.map((x) => x.t)], wrong: 0, correction: wrong.correction },
          explanation: 'الخطأ: ' + wrong.t + ' والصواب: ' + wrong.correction,
          refs: { personIds: [pr.person.id], claimIds: keep.map((x) => x.id).filter(Boolean) }, demo: isDemo(pr.person),
        })) n++;
      }
    },
    'order-event'() {
      let n = 0;
      const ev = events.filter((e) => e.year && !e.yearAlt);
      for (let k = 0; k < limit * 2 && n < limit; k++) {
        const pick = [];
        for (const e of shuffle(ev)) if (!pick.some((x) => x.year === e.year)) { pick.push(e); if (pick.length === (k % 2 ? 5 : 4)) break; }
        if (pick.length < 4) return;
        if (add('order-event', {
          sigKey: pick.map((e) => e.id).sort().join(','), categories: ['qaid'], difficulty: clamp(pick.length === 5 ? 2.5 : 1.6),
          prompt: 'الخط الزمني: رتّب الوقائع من الأقدم إلى الأحدث.',
          data: { items: pick.map((e) => ({ label: e.title, value: e.year, shown: ar(e.year) + 'هـ' })) },
          explanation: pick.slice().sort((a, b) => a.year - b.year).map((e) => e.title + ' (' + ar(e.year) + 'هـ)').join(' ← ') + '.',
          refs: { eventIds: pick.map((e) => e.id), personIds: [...new Set(pick.flatMap((e) => e.personIds || []))].filter((id) => byId[id]) },
          demo: isDemo(pick),
        })) n++;
      }
    },
    'match-event'() {
      let n = 0;
      const pairs = events.flatMap((e) => (e.personIds || []).filter((id) => byId[id]).map((pid) => ({ e, pid })));
      for (let k = 0; k < limit * 3 && n < limit; k++) {
        const pick = [];
        for (const p of shuffle(pairs)) {
          if (pick.some((x) => x.pid === p.pid || x.e.id === p.e.id)) continue;
          pick.push(p); if (pick.length === 4) break;
        }
        if (pick.length < 3) return;
        if (pick.some((a) => pick.some((b) => a !== b && (b.e.personIds || []).includes(a.pid)))) continue;
        if (add('match-event', {
          sigKey: pick.map((p) => p.e.id + p.pid).sort().join(','), categories: ['qaid'], difficulty: clamp(1.8),
          prompt: 'اربط كل قائد بالواقعة التي ارتبط بها.',
          data: { left: pick.map((p) => personsById[p.pid].name), right: pick.map((p) => p.e.title) },
          explanation: pick.map((p) => personsById[p.pid].name + ': ' + p.e.title + (p.e.year ? ' (' + ar(p.e.year) + 'هـ)' : '')).join('، ') + '.',
          refs: { personIds: pick.map((p) => p.pid), eventIds: pick.map((p) => p.e.id) }, demo: isDemo(pick.map((p) => p.e)),
        })) n++;
      }
    },
    map() {
      let n = 0;
      const located = d.places.filter((p) => p.lat != null && p.lon != null);
      for (const e of shuffle(events.filter((x) => places[x.placeId] && places[x.placeId].lat != null))) {
        if (n >= limit) return;
        const pl = places[e.placeId];
        const others = shuffle(located.filter((p) => p.id !== pl.id && AR.normalize(p.name) !== AR.normalize(pl.name))).slice(0, 3);
        if (others.length < 3) continue;
        const opts = [pl, ...others];
        if (add('map', {
          sigKey: e.id, categories: ['qaid'], difficulty: clamp(2),
          prompt: 'خريطة الأحداث: أين وقعت ' + e.title + '؟',
          data: { options: opts.map((p) => p.name), pins: opts.map((p) => ({ label: p.name, lat: p.lat, lon: p.lon })), answer: 0 },
          explanation: e.title + ' وقعت في ' + pl.name + (e.year ? ' سنة ' + ar(e.year) + 'هـ' : '') + '.',
          refs: { eventIds: [e.id], personIds: (e.personIds || []).filter((id) => byId[id]) }, demo: isDemo(e),
        })) n++;
      }
    },
    decision() {
      let n = 0;
      const ev = events.filter((e) => e.outcome && e.context);
      for (const e of shuffle(ev)) {
        if (n >= limit) return;
        const others = shuffle(ev.filter((x) => x.id !== e.id)).slice(0, 3);
        if (others.length < 3) continue;
        if (add('decision', {
          sigKey: e.id, categories: ['qaid'], difficulty: clamp(2),
          prompt: e.context + ' — فما الذي حدث فعلًا؟',
          data: { options: [e.outcome, ...others.map((x) => x.outcome)], answer: 0 },
          explanation: e.title + ': ' + e.outcome,
          refs: { eventIds: [e.id], personIds: (e.personIds || []).filter((id) => byId[id]) }, demo: isDemo(e),
        })) n++;
      }
    },
    quote() {
      let n = 0;
      for (const pr of shuffle(profiles)) for (const c of pr.quotes) {
        if (n >= limit) return;
        const ds = distractors(pr, 3, (o) => !o.quotes.some((x) => AR.normalize(x.value.text) === AR.normalize(c.value.text)));
        if (!ds) continue;
        if (add('quote', {
          sigKey: c.id, categories: cats([pr]), difficulty: clamp(level(pr) + 0.3),
          prompt: 'لمن هذه المقولة؟ «' + c.value.text + '»',
          data: { options: [pr, ...ds].map((o) => o.person.name), answer: 0 },
          explanation: 'المقولة منسوبة إلى ' + pr.person.name + ' في المصدر الموثق أدناه.',
          refs: { personIds: [pr.person.id], claimIds: [c.id] }, demo: isDemo(c),
        })) n++;
      }
    },
    'match-stance'() {
      let n = 0;
      const pool = profiles.filter((p) => p.stances.length);
      for (let k = 0; k < limit * 2 && n < limit; k++) {
        const pick = shuffle(pool).slice(0, 4);
        if (pick.length < 3) return;
        const st = pick.map((p) => shuffle(p.stances)[0]);
        if (add('match-stance', {
          sigKey: st.map((s) => s.id).sort().join(','), categories: cats(pick), difficulty: clamp(2),
          prompt: 'صل كل شخصية بموقفها.',
          data: { left: pick.map((p) => p.person.name), right: st.map((s) => s.value.text) },
          explanation: pick.map((p, i) => p.person.name + ': ' + st[i].value.text).join(' — '),
          refs: { personIds: pick.map((p) => p.person.id), claimIds: st.map((s) => s.id) }, demo: isDemo(st),
        })) n++;
      }
    },
    cloze() {
      let n = 0;
      const years = profiles.filter((p) => p.death).map((p) => p.death);
      for (const pr of shuffle(profiles)) {
        if (n >= limit) return;
        if (pr.death && rng() < 0.6) {
          const dc = pr.claims.find((c) => c.kind === 'death');
          const ds = [...new Set(shuffle(years.filter((y) => Math.abs(y - pr.death) >= 15)))].slice(0, 3);
          while (ds.length < 3) { const y = pr.death + (ds.length + 1) * (rng() < 0.5 ? -23 : 31); if (y > 0 && !ds.includes(y)) ds.push(y); }
          if (add('cloze', {
            sigKey: pr.person.id + ':death', categories: cats([pr]), difficulty: clamp(level(pr) + 0.5),
            prompt: 'أكمل المعلومة: توفي ' + pr.person.name + ' سنة ____ هـ.',
            data: { options: [pr.death, ...ds].map((y) => ar(y) + 'هـ'), answer: 0 },
            explanation: 'توفي ' + pr.person.name + ' سنة ' + ar(pr.death) + 'هـ.',
            refs: { personIds: [pr.person.id], claimIds: dc ? [dc.id] : [] }, demo: isDemo(pr.person),
          })) n++;
        } else if (pr.works.length) {
          const w = pr.works[0];
          const others = shuffle(profiles.filter((o) => o.person.id !== pr.person.id).flatMap((o) => o.works))
            .filter((x) => !pr.works.some((m) => AR.normalize(m.value.title) === AR.normalize(x.value.title)));
          const titles = [...new Set(others.map((x) => x.value.title))].slice(0, 3);
          if (titles.length < 3) continue;
          if (add('cloze', {
            sigKey: pr.person.id + ':work:' + w.id, categories: cats([pr]), difficulty: clamp(level(pr)),
            prompt: 'أكمل المعلومة: من مؤلفات ' + pr.person.name + ' كتاب «____».',
            data: { options: [w.value.title, ...titles], answer: 0 },
            explanation: '«' + w.value.title + '» من مؤلفات ' + pr.person.name + '.',
            refs: { personIds: [pr.person.id], claimIds: [w.id] }, demo: isDemo(w),
          })) n++;
        }
      }
    },
    lesson() {
      let n = 0;
      const st = profiles.flatMap((p) => p.stances.filter((s) => s.value.lesson).map((s) => ({ s, p })));
      for (const e of shuffle(st)) {
        if (n >= limit) return;
        const others = [...new Set(st.filter((x) => x.s.id !== e.s.id).map((x) => x.s.value.lesson))]
          .filter((l) => AR.normalize(l) !== AR.normalize(e.s.value.lesson));
        if (others.length < 3) continue;
        if (add('lesson', {
          sigKey: e.s.id, categories: cats([e.p]), difficulty: clamp(1.5),
          prompt: 'موقف: ' + e.p.person.name + ' — ' + e.s.value.text + ' ما الدرس المستفاد؟',
          data: { options: [e.s.value.lesson, ...shuffle(others).slice(0, 3)], answer: 0 },
          explanation: e.s.value.lesson,
          refs: { personIds: [e.p.person.id], claimIds: [e.s.id] }, demo: isDemo(e.s),
        })) n++;
      }
    },
    term() {
      let n = 0;
      const ts = d.terms.filter((t) => kb.usable(t));
      for (const t of shuffle(ts)) {
        if (n >= limit) return;
        const others = shuffle(ts.filter((x) => x.id !== t.id)).slice(0, 3);
        if (others.length < 3) continue;
        if (add('term', {
          sigKey: t.id, categories: ['faqih'], difficulty: clamp(t.level || 2),
          prompt: 'ما معنى المصطلح الفقهي «' + t.term + '»' + (t.madhhab ? ' عند ' + t.madhhab : '') + '؟',
          data: { options: [t.definition, ...others.map((x) => x.definition)], answer: 0 },
          explanation: '«' + t.term + '»: ' + t.definition,
          refs: { termIds: [t.id] }, demo: isDemo(t),
        })) n++;
      }
    },
    excerpt() {
      let n = 0;
      const cl = d.claims.filter((c) => kb.usable(c) && (c.citations || []).some((x) => x.excerpt) && byId[c.personId]);
      for (const c of shuffle(cl)) {
        if (n >= limit) return;
        const pr = byId[c.personId];
        const cit = c.citations.find((x) => x.excerpt);
        let prompt, options;
        if (c.kind === 'death') {
          prompt = 'بحسب المقتطف: في أي سنة توفي ' + pr.person.name + '؟';
          const ys = [c.value.year, c.value.year - 7, c.value.year + 12, c.value.year + 31].map((y) => ar(y) + 'هـ');
          options = ys;
        } else if (c.kind === 'teacher' && personsById[c.value.personId]) {
          const ds = distractors(pr, 3, (o) => o.person.id !== c.value.personId);
          if (!ds) continue;
          prompt = 'بحسب المقتطف: من شيخ ' + pr.person.name + ' المذكور في النص؟';
          options = [personsById[c.value.personId].name, ...ds.map((o) => o.person.name)];
        } else if (c.kind === 'work') {
          const ot = shuffle(profiles.flatMap((o) => o.works)).map((w) => w.value.title).filter((t) => AR.normalize(t) !== AR.normalize(c.value.title));
          const uniq = [...new Set(ot)].slice(0, 3);
          if (uniq.length < 3) continue;
          prompt = 'بحسب المقتطف: ما الكتاب الذي يذكر النص أنه من مؤلفات ' + pr.person.name + '؟';
          options = [c.value.title, ...uniq];
        } else continue;
        if (add('excerpt', {
          sigKey: c.id, categories: cats([pr]), difficulty: clamp(1.5),
          prompt,
          data: { excerpt: cit.excerpt, options, answer: 0 },
          explanation: claimText(c, personsById),
          refs: { personIds: [pr.person.id], claimIds: [c.id] }, demo: isDemo(c),
        })) n++;
      }
    },
  };

  for (const m of modes) if (gens[m]) gens[m]();
  return out;
}

module.exports = { generate };
