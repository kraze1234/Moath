/* ساحة اللعب الفردي: الفروع، الألعاب الإضافية، التحدي الأكبر متعدد المراحل، الموسوعة المفقودة */
(function () {
  'use strict';
  const { h, api, emblem, topbar, demoBanner, num, toast, Sound, citations, confetti, timerEl } = window.HimmaUI;
  const Engine = window.HimmaEngine;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const SEEN_KEY = 'himma-seen';

  const seen = {
    get() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } },
    add(ids) { try { const s = [...new Set(this.get().concat(ids))].slice(-400); localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch {} },
  };

  let cat, view, state;

  async function main() {
    try { cat = await api('/api/catalog'); } catch (e) { app.append(topbar(), h('div', { class: 'wrap empty' }, h('b', null, 'تعذر التحميل'), e.message)); return; }
    app.append(topbar(), demoBanner(cat.demoInPlay));
    view = h('main', { class: 'wrap play-shell' });
    app.append(view);
    setup();
  }

  /* ===== تحديد ما سيُلعب ===== */
  function target() {
    const b = cat.BRANCHES.find((x) => x.id === params.get('branch'));
    if (b) return { kind: 'branch', id: b.id, title: '«' + b.title + '»', desc: b.tagline, emblem: b.emblem, modes: b.modes, categories: [b.category] };
    const g = cat.GAMES.find((x) => x.id === params.get('game'));
    if (g) return { kind: g.id === 'encyclopedia' ? 'ency' : 'game', id: g.id, title: '«' + g.title + '»', desc: g.desc, emblem: g.emblem, modes: g.modes === '*' ? Object.keys(cat.MODES) : g.modes, categories: null, pages: g.pages };
    if (params.get('grand')) return { kind: 'grand', id: 'grand', title: '«تحدي الهمّة الكبرى»', desc: 'جولات متتابعة من كل الفروع، تشتد صعوبتها تدريجيًا.', emblem: 'crown', modes: Object.keys(cat.MODES), categories: null };
    return null;
  }

  function availableCount(mode, catIds) {
    const a = cat.availability[mode];
    if (!a) return 0;
    if (!catIds) return a.total;
    return catIds.reduce((s, c) => s + (a.byCat[c] || 0), 0);
  }

  function setup() {
    view.innerHTML = '';
    const t = target();
    if (!t) { location.href = '/'; return; }
    document.title = 'الهمّة — ' + t.title.replace(/[«»]/g, '');
    const paper = h('section', { class: 'paper setup stage' });
    paper.append(h('div', { class: 'row' }, emblem(t.emblem), h('div', null, h('h2', { style: { margin: 0 } }, t.title), h('p', { class: 'muted', style: { margin: 0 } }, t.desc))));

    const opt = { modes: new Set(), count: 10, timer: 0 };
    if (t.kind === 'branch' || t.kind === 'game') {
      const pick = h('div', { class: 'mode-pick' });
      for (const m of t.modes) {
        const n = availableCount(m, t.categories);
        const b = h('button', { class: 'mode-opt' + (n ? ' on' : ''), type: 'button', disabled: !n, 'aria-pressed': String(!!n),
          onclick: () => { if (opt.modes.has(m)) opt.modes.delete(m); else opt.modes.add(m); b.classList.toggle('on', opt.modes.has(m)); b.setAttribute('aria-pressed', String(opt.modes.has(m))); start.disabled = !opt.modes.size; } },
          h('b', null, cat.MODES[m].title), h('span', null, cat.MODES[m].desc), h('em', null, n ? num(n) + ' سؤالًا معتمدًا' : 'لا توجد أسئلة معتمدة بعد'));
        if (n) opt.modes.add(m);
        pick.append(b);
      }
      paper.append(h('h3', { style: { marginTop: '1.2rem' } }, 'أنماط اللعب'), pick);
    }
    if (t.kind === 'grand') {
      paper.append(h('h3', { style: { marginTop: '1.2rem' } }, 'مراحل التحدي'),
        h('ol', null, cat.GRAND_PLAN.map((r) => h('li', null, cat.ROUND_TYPES[r.type].title + ' — ' + num(r.count) + ' أسئلة' + (cat.ROUND_TYPES[r.type].risk ? ' (تراهن فيها على نقاطك)' : '') + (cat.ROUND_TYPES[r.type].speedBonus ? ' (مكافأة للسرعة)' : '')))));
    }
    if (t.kind === 'ency') {
      paper.append(h('p', null, 'حلّ ' + num(t.pages) + ' تحديات متتابعة من مختلف الأنماط. كل إجابة صحيحة تكشف صفحة من الموسوعة فيها معلومة موثقة. هل تجمع الموسوعة كاملة؟'));
    }
    const ctl = h('div', { class: 'row', style: { marginTop: '1rem', gap: '1.5rem' } });
    if (t.kind === 'branch' || t.kind === 'game') ctl.append(segCtl('عدد الأسئلة', [5, 10, 15], opt.count, (v) => (opt.count = v)));
    if (t.kind !== 'grand') ctl.append(segCtl('المؤقت', [[0, 'بلا'], [30, '٣٠ث'], [60, '٦٠ث']], opt.timer, (v) => (opt.timer = v)));
    paper.append(ctl);
    const start = h('button', { class: 'btn btn-gold btn-lg', type: 'button', disabled: (t.kind === 'branch' || t.kind === 'game') && !opt.modes.size,
      onclick: () => begin(t, opt) }, 'ابدأ');
    const total = t.modes.reduce((s, m) => s + availableCount(m, t.categories), 0);
    paper.append(h('div', { class: 'next-row' }, h('a', { class: 'btn btn-ghost', href: '/', style: { color: '#2a2112' } }, 'رجوع'), start));
    if (!total) paper.append(h('div', { class: 'empty' }, h('b', null, 'لا يوجد محتوى معتمد لهذا القسم بعد'), 'يظهر المحتوى هنا بعد أن يعتمده المشرف من لوحة الإدارة.'));
    view.append(h('div', { class: 'play-head' }, h('h1', null, t.title)), paper);
    start.focus();
  }

  function segCtl(label, values, cur, onSet) {
    const wrap = h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', null, label));
    const seg = h('div', { class: 'seg-ctl', role: 'group', 'aria-label': label });
    values.forEach((v) => {
      const [val, txt] = Array.isArray(v) ? v : [v, num(v)];
      const b = h('button', { type: 'button', class: val === cur ? 'on' : '', 'aria-pressed': String(val === cur), onclick: () => { seg.querySelectorAll('button').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); onSet(val); } }, txt);
      seg.append(b);
    });
    wrap.append(seg);
    return wrap;
  }

  /* ===== بدء اللعب ===== */
  async function fetchQs(modes, categories, count, difficulty, exclude) {
    const qs = new URLSearchParams({ modes: modes.join(','), count: String(count) });
    if (categories) qs.set('categories', categories.join(','));
    if (difficulty) qs.set('difficulty', difficulty.join(','));
    if (exclude && exclude.length) qs.set('exclude', exclude.slice(-300).join(','));
    return api('/api/play/questions?' + qs);
  }

  async function begin(t, opt) {
    state = { t, opt, score: 0, correct: 0, answered: 0, learned: [], stages: [], si: 0, qi: 0, pages: [] };
    try {
      if (t.kind === 'grand') {
        const used = seen.get();
        for (const r of cat.GRAND_PLAN) {
          const rt = cat.ROUND_TYPES[r.type];
          const modes = rt.modes === '*' ? Object.keys(cat.MODES) : rt.modes;
          let res = await fetchQs(modes, null, r.count, r.difficulty, used);
          if (res.questions.length < r.count) res = await fetchQs(modes, null, r.count, null, used);
          res.questions.forEach((q) => used.push(q.id));
          if (res.questions.length) state.stages.push({ title: rt.title, rt, questions: res.questions });
        }
      } else {
        const modes = t.kind === 'ency' ? t.modes : [...opt.modes];
        const count = t.kind === 'ency' ? t.pages : opt.count;
        const res = await fetchQs(modes, t.categories, count, null, seen.get());
        if (res.exhausted) toast('أنهيت معظم أسئلة هذا القسم؛ قد تتكرر بعض الأسئلة.', 'ok');
        state.stages.push({ title: null, rt: null, questions: res.questions });
      }
    } catch (e) { toast(e.message, 'err'); return; }
    if (!state.stages.length || !state.stages.some((s) => s.questions.length)) { toast('لا توجد أسئلة معتمدة كافية.', 'err'); return; }
    state.total = state.stages.reduce((s, x) => s + x.questions.length, 0);
    if (t.kind === 'grand') stageIntro(); else nextQuestion();
  }

  function hud() {
    const t = state.t;
    const done = state.answered;
    return h('div', null,
      h('div', { class: 'play-head' }, h('h1', null, t.title),
        h('div', { class: 'hud' },
          state.stages[state.si] && state.stages[state.si].title ? h('span', { class: 'pill' }, state.stages[state.si].title) : null,
          h('span', { class: 'pill' }, 'السؤال ', h('b', null, num(Math.min(done + 1, state.total))), ' من ', num(state.total)),
          h('span', { class: 'pill' }, 'النقاط ', h('b', { id: 'scoreVal' }, num(state.score))),
          state.timerEl || null)),
      h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i', { style: { width: (done / state.total * 100) + '%' } })));
  }

  function stageIntro() {
    const st = state.stages[state.si];
    view.innerHTML = '';
    const go = h('button', { class: 'btn btn-gold btn-lg', type: 'button', onclick: () => nextQuestion() }, 'ابدأ الجولة');
    view.append(hud(), h('section', { class: 'round-intro stage' },
      h('div', { class: 'num' }, 'المرحلة ' + num(state.si + 1) + ' من ' + num(state.stages.length)),
      h('h2', null, st.title),
      h('p', { class: 'muted' }, num(st.questions.length) + ' أسئلة' + (st.rt.risk ? ' — راهن بجزء من نقاطك قبل كل سؤال' : '') + (st.rt.speedBonus ? ' — أجب بسرعة لتنال مكافأة' : '') + (st.rt.multiplier > 1 ? ' — النقاط مضاعفة' : '')),
      go));
    go.focus();
    Sound.reveal();
  }

  function currentQ() { const st = state.stages[state.si]; return st && st.questions[state.qi]; }

  function nextQuestion() {
    const st = state.stages[state.si];
    const raw = currentQ();
    if (!raw) return finish();
    if (st.rt && st.rt.risk) return betScreen(raw);
    showQuestion(raw, 0);
  }

  function betScreen(raw) {
    view.innerHTML = '';
    const max = Math.max(0, state.score);
    const out = h('b', null, num(Math.round(max / 2)));
    const range = h('input', { type: 'range', min: 0, max, step: Math.max(5, Math.round(max / 20 / 5) * 5) || 5, value: Math.round(max / 2), 'aria-label': 'مقدار الرهان', style: { width: '100%' },
      oninput: () => (out.textContent = num(range.value)) });
    const go = h('button', { class: 'btn btn-gold btn-lg', type: 'button', onclick: () => showQuestion(raw, +range.value) }, 'اعرض السؤال');
    view.append(hud(), h('section', { class: 'paper stage setup center' },
      h('h2', null, 'جولة المخاطرة'),
      h('p', null, 'صعوبة السؤال القادم: ', h('b', null, cat.DIFFICULTY[raw.difficulty].name), ' — نمطه: ', h('b', null, cat.MODES[raw.mode].title)),
      max ? h('div', null, h('p', null, 'كم تراهن من نقاطك؟ ', out), range) : h('p', { class: 'muted' }, 'ليس لديك نقاط للمراهنة بعد؛ أجب لتكسب الخبرة.'),
      h('div', { class: 'next-row', style: { justifyContent: 'center' } }, go)));
    go.focus();
  }

  let tick = null;
  function showQuestion(raw, bet) {
    clearInterval(tick);
    const st = state.stages[state.si];
    const q = Engine.prepare(raw);
    const timerSec = st.rt ? st.rt.timer : state.opt.timer;
    state.timerEl = timerSec ? timerEl() : null;
    view.innerHTML = '';
    const paper = h('section', { class: 'paper stage' });
    let answered = false, startAt = Date.now();
    const qv = window.HimmaQ.render(q, { onAnswer: (ans) => onAnswer(ans) });
    paper.append(qv.el);
    view.append(hud(), paper);
    const first = paper.querySelector('button:not([disabled])');
    if (first) first.focus({ preventScroll: true });

    if (timerSec) {
      const total = timerSec * 1000;
      const upd = () => {
        const rem = total - (Date.now() - startAt);
        state.timerEl.set(rem, total);
        if (rem <= 0 && !answered) { clearInterval(tick); qv.lock(); onAnswer(null, true); }
      };
      upd(); tick = setInterval(upd, 250);
    }

    function onAnswer(ans, timeout) {
      if (answered) return;
      answered = true; clearInterval(tick); qv.lock();
      const g = Engine.grade(q, ans);
      let pts;
      if (st.rt && st.rt.risk) pts = g.correct ? bet : -bet;
      else {
        const speedFactor = st.rt && st.rt.speedBonus ? Math.max(0, 1 - (Date.now() - startAt) / (timerSec * 1000)) : 0;
        pts = Engine.points(q, g.fraction, { multiplier: st.rt ? st.rt.multiplier : 1, answer: ans, speedFactor });
      }
      state.score += pts; state.answered++;
      if (g.correct) state.correct++;
      seen.add([raw.id]);
      qv.showResult(g, q);
      if (g.correct) Sound.correct(); else if (g.fraction > 0) Sound.partial(); else Sound.wrong();
      const sv = document.getElementById('scoreVal'); if (sv) sv.textContent = num(state.score);
      if (raw.learn) state.learned.push(raw.learn);
      if (state.t.kind === 'ency') state.pages.push(g.correct ? { text: (raw.learn && raw.learn.text) || raw.explanation, learn: raw.learn, demo: raw.demo } : null);
      paper.append(feedback(q, raw, g, pts, timeout));
    }
  }

  function feedback(q, raw, g, pts, timeout) {
    const cls = g.correct ? 'ok' : g.fraction > 0 ? 'part' : 'no';
    const title = timeout ? 'انتهى الوقت' : g.correct ? 'أحسنت! إجابة صحيحة' : g.fraction > 0 ? 'إجابة جزئية — ' + num(Math.round(g.fraction * 100)) + '٪' : 'ليست الإجابة الصحيحة';
    const box = h('div', { class: 'feedback ' + cls, role: 'status' },
      h('h3', null, title + (pts ? ' (' + (pts > 0 ? '+' : '') + num(pts) + ')' : '')),
      q.type === 'order' || q.type === 'match' ? null : h('div', { class: 'ans' }, 'الإجابة: ', Engine.answerText(q)),
      raw.explanation ? h('p', { style: { margin: '.3rem 0 0' } }, raw.explanation) : null,
      citations(raw.citations, raw.demo));
    if (raw.learn) {
      box.append(h('div', { class: 'learn' }, h('div', { class: 't' }, '✦ معلومة جديدة عن الشخصية'), h('div', null, raw.learn.text), citations(raw.learn.citations, raw.learn.demo)));
    }
    if (state.t.kind === 'ency') box.append(h('div', { class: 'small', style: { marginTop: '.5rem' } }, g.correct ? '📜 كشفت صفحة جديدة من الموسوعة!' : 'بقيت هذه الصفحة مفقودة.'));
    const next = h('button', { class: 'btn btn-gold', type: 'button', onclick: advance }, isLast() ? 'النتيجة' : 'التالي ←');
    box.append(h('div', { class: 'next-row' }, next));
    setTimeout(() => { next.focus({ preventScroll: true }); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
    return box;
  }

  function isLast() {
    const st = state.stages[state.si];
    return state.qi + 1 >= st.questions.length && state.si + 1 >= state.stages.length;
  }

  function advance() {
    const st = state.stages[state.si];
    state.qi++;
    if (state.qi >= st.questions.length) {
      state.si++; state.qi = 0;
      if (state.si >= state.stages.length) return finish();
      if (state.t.kind === 'grand') return stageIntro();
    }
    nextQuestion();
  }

  function finish() {
    clearInterval(tick);
    state.timerEl = null;
    view.innerHTML = '';
    const ratio = state.total ? state.correct / state.total : 0;
    const stars = ratio >= .9 ? 3 : ratio >= .6 ? 2 : ratio >= .3 ? 1 : 0;
    const paper = h('section', { class: 'paper stage summary' },
      h('h2', null, stars === 3 ? 'همّة عالية! ما شاء الله' : stars === 2 ? 'أداء جميل' : 'بداية طيبة، واصل'),
      h('div', { class: 'stars', 'aria-label': num(stars) + ' نجوم' }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
      h('div', { class: 'score' }, num(state.score)),
      h('p', { class: 'muted' }, 'أجبت إجابة كاملة عن ' + num(state.correct) + ' من ' + num(state.total)));
    if (state.t.kind === 'ency') {
      const got = state.pages.filter(Boolean).length;
      paper.append(h('h3', null, 'الموسوعة: جمعت ' + num(got) + ' من ' + num(state.pages.length) + ' صفحات'),
        h('div', { class: 'ency' }, state.pages.map((p, i) => p ? h('div', { class: 'page new', style: { animationDelay: i * .12 + 's' } }, h('b', null, 'صفحة ' + num(i + 1)), h('div', null, p.text), p.learn ? citations(p.learn.citations, p.learn.demo) : null) : h('div', { class: 'page locked' }))));
    } else if (state.learned.length) {
      paper.append(h('h3', { style: { textAlign: 'start', marginTop: '1.4rem' } }, 'ما تعلمته في هذه الجولة'),
        h('div', { style: { textAlign: 'start', display: 'grid', gap: '.5rem' } }, state.learned.slice(0, 8).map((l) => h('div', { class: 'learn' }, l.text, citations(l.citations, l.demo)))));
    }
    paper.append(h('div', { class: 'next-row', style: { justifyContent: 'center' } },
      h('button', { class: 'btn btn-gold', type: 'button', onclick: () => begin(state.t, state.opt) }, 'العب مرة أخرى'),
      h('button', { class: 'btn', type: 'button', onclick: setup }, 'تغيير الإعدادات'),
      h('a', { class: 'btn btn-ghost', href: '/', style: { color: '#2a2112' } }, 'الرئيسية')));
    view.append(paper);
    if (stars >= 2) { confetti(3500); Sound.fanfare(); }
  }

  /* لوحة المفاتيح: أرقام للاختيار، Enter للتالي، Esc للرجوع */
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Enter' && !e.target.closest('a')) {
      // نعالج Enter بأنفسنا حتى لا يصل الضغط نفسه إلى أول خيار في السؤال التالي فيجيب عنه
      const next = view.querySelector('.feedback .next-row button') || view.querySelector('.round-intro button');
      if (next) { e.preventDefault(); next.click(); return; }
    }
    if (e.key === 'Escape') { if (state) { if (confirm('الخروج من الجولة الحالية؟')) { clearInterval(tick); state = null; setup(); } } else location.href = '/'; }
    const n = '123456'.indexOf(e.key) >= 0 ? '123456'.indexOf(e.key) : '١٢٣٤٥٦'.indexOf(e.key);
    if (n >= 0) {
      const btn = view.querySelectorAll('.opt:not([disabled]), .book:not([disabled]), .stmt:not([disabled])')[n];
      if (btn) { e.preventDefault(); btn.click(); }
    }
  });

  main();
})();
