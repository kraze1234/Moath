/* واجهة المشارك على الهاتف: الدخول برمز الجلسة، اختيار الفريق، الإجابة، النتائج */
(function () {
  'use strict';
  const { h, api, topbar, num, toast, Sound, citations, confetti, timerEl } = window.HimmaUI;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const KEY = 'himma-player';
  const main = h('main', { class: 'phone' });
  app.append(topbar('join'), main);

  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

  function codeForm(prefill, err) {
    main.innerHTML = '';
    const input = h('input', { class: 'input', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, value: prefill || '', id: 'code', autocomplete: 'off',
      style: { fontSize: '2rem', textAlign: 'center', letterSpacing: '.4em', direction: 'ltr', fontFamily: 'var(--f-head)' } });
    const go = async (e) => {
      e && e.preventDefault();
      const code = input.value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
      try { const info = await api('/api/join/' + encodeURIComponent(code)); teamForm(code, info); } catch (er) { toast(er.message, 'err'); }
    };
    main.append(h('section', { class: 'paper stage' },
      h('h2', null, 'انضم إلى المسابقة'),
      err ? h('p', { class: 'muted' }, err) : null,
      h('form', { onsubmit: go },
        h('div', { class: 'field' }, h('label', { for: 'code' }, 'رمز الجلسة (يظهر على الشاشة)'), input),
        h('button', { class: 'btn btn-gold btn-lg', type: 'submit', style: { width: '100%' } }, 'متابعة'))));
    input.focus();
    if (prefill && prefill.length === 4) go();
  }

  function teamForm(code, info) {
    main.innerHTML = '';
    let teamId = null;
    const name = h('input', { class: 'input', id: 'pname', maxlength: 30, autocomplete: 'nickname', placeholder: 'اسمك' });
    const pick = h('div', { class: 'team-pick', role: 'radiogroup', 'aria-label': 'اختر فريقك' }, info.teams.map((t) => h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', style: { '--tc': t.color },
      onclick: (e) => { teamId = t.id; pick.querySelectorAll('button').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-checked', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-checked', 'true'); } }, t.name)));
    const go = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/join', { body: { code, name: name.value, teamId } });
        save({ ...r, code, name: name.value });
        connect(r.sessionId, r.token);
      } catch (er) { toast(er.message, 'err'); }
    };
    main.append(h('section', { class: 'paper stage' },
      h('h2', null, info.name),
      info.answerMode !== 'phones' ? h('p', { class: 'muted' }, 'هذه الجلسة تعمل بوضع الشاشة الواحدة؛ ستتابع الأسئلة والنتائج من هاتفك، والإجابة على الشاشة المعروضة.') : null,
      h('form', { onsubmit: go },
        h('div', { class: 'field' }, h('label', { for: 'pname' }, 'اسمك'), name),
        h('div', { class: 'field' }, h('label', null, 'فريقك'), pick),
        h('button', { class: 'btn btn-gold btn-lg', type: 'submit', style: { width: '100%' } }, 'انضمام'))));
    name.focus();
  }

  function connect(sessionId, token) {
    let S = null, offset = 0, key = null, qv = null, tick = null, lastPhase = null;
    main.innerHTML = '';
    const es = new EventSource('/api/sessions/' + sessionId + '/stream?token=' + encodeURIComponent(token));
    es.onmessage = (ev) => { S = JSON.parse(ev.data); offset = S.serverNow - Date.now(); render(); };
    es.onerror = () => {
      if (es.readyState === 2) { es.close(); localStorage.removeItem(KEY); codeForm('', 'انتهت الجلسة أو تعذر الاتصال. أدخل الرمز من جديد.'); }
    };
    const myTeam = () => S && S.me && S.teams.find((t) => t.id === S.me.teamId);
    const send = async (answer) => {
      try { await api('/api/sessions/' + sessionId + '/answer', { body: { token, answer } }); Sound.tick(); } catch (e) { toast(e.message, 'err'); if (qv) render(true); }
    };

    function header() {
      const t = myTeam();
      return h('div', { class: 'row', style: { marginBottom: '.8rem' } },
        t ? h('span', { class: 'team-tag', style: { '--tc': t.color } }, t.name) : null,
        h('span', { class: 'muted small' }, S.me ? S.me.name : ''),
        h('span', { class: 'spacer' }),
        t ? h('span', { class: 'badge badge-info' }, 'نقاط فريقك: ' + num(t.score)) : null);
    }

    function render(force) {
      if (!S) return;
      if (!S.me) { es.close(); localStorage.removeItem(KEY); codeForm('', 'أُزلت من الجلسة. يمكنك الانضمام من جديد.'); return; }
      const c = S.current || {};
      const k = S.phase + ':' + (c.qid || '') + ':' + S.status + ':' + (S.myAnswer ? 'a' : '');
      if (S.phase === 'revealed' && lastPhase !== 'revealed') {
        const r = c.results && c.results[S.me.teamId];
        if (r) (r.correct ? Sound.correct() : r.fraction > 0 ? Sound.partial() : Sound.wrong());
      }
      lastPhase = S.phase;
      if (k === key && !force) {
        if (qv && qv.setStep && c.clueStep) qv.setStep(c.clueStep);
        if (qv && qv.setRevealed && c.revealed) qv.setRevealed(c.revealed);
        const hd = main.querySelector('.row'); if (hd) hd.replaceWith(header());
        const bet = main.querySelector('.my-bet'); if (bet) bet.textContent = c.bets && c.bets[S.me.teamId] != null ? 'رهان فريقك: ' + num(c.bets[S.me.teamId]) : '';
        return;
      }
      key = k; clearInterval(tick); qv = null;
      main.innerHTML = '';
      main.append(header());
      if (S.status === 'paused') main.append(h('div', { class: 'demo-banner', style: { borderRadius: '10px', marginBottom: '.6rem' } }, 'المسابقة متوقفة مؤقتًا'));
      const wait = (txt) => main.append(h('div', { class: 'wait' }, h('div', { class: 'spin' }), h('p', null, txt)));

      if (S.phase === 'lobby') return wait('انضممت بنجاح! بانتظار أن يبدأ المشرف المسابقة…');
      if (S.phase === 'intro') return main.append(h('section', { class: 'round-intro' }, h('div', { class: 'num' }, 'الجولة ' + num(S.round.index + 1)), h('h2', null, S.round.title), h('p', { class: 'muted' }, 'استعدوا…')));
      if (S.phase === 'betting') {
        const t = myTeam();
        const amount = h('input', { class: 'input', type: 'number', min: 0, max: Math.max(0, t.score), value: Math.round(Math.max(0, t.score) / 2), 'aria-label': 'مقدار الرهان' });
        main.append(h('section', { class: 'paper stage' },
          h('h2', null, 'جولة المخاطرة'),
          c.preview ? h('p', null, 'صعوبة السؤال: ' + window.HimmaCatalog.DIFFICULTY[c.preview.difficulty].name) : null,
          S.answerMode === 'phones'
            ? h('div', null, h('p', null, 'كم يراهن فريقك؟ (حتى ' + num(Math.max(0, t.score)) + ')'), amount,
              h('button', { class: 'btn btn-gold', type: 'button', style: { marginTop: '.6rem', width: '100%' }, onclick: async () => {
                try { await api('/api/sessions/' + sessionId + '/bet', { body: { token, amount: amount.value } }); toast('سُجل الرهان', 'ok'); } catch (e) { toast(e.message, 'err'); }
              } }, 'تأكيد الرهان'))
            : h('p', { class: 'muted' }, 'يسجل المشرف الرهانات على الشاشة.'),
          h('p', { class: 'my-bet small' }, c.bets && c.bets[S.me.teamId] != null ? 'رهان فريقك: ' + num(c.bets[S.me.teamId]) : '')));
        return;
      }
      if (S.phase === 'finished') {
        const ranked = S.teams.slice().sort((a, b) => b.score - a.score);
        const won = (S.winners || []).includes(S.me.teamId);
        main.append(h('section', { class: 'paper stage summary' },
          h('h2', null, won ? 'مبارك! فريقك فاز' : 'انتهت المسابقة'),
          h('div', { class: 'big-board' }, ranked.map((t, i) => h('div', { class: 'team-row', style: { '--tc': t.color, color: '#2a2112' } }, h('span', null, num(i + 1)), h('span', { class: 'nm' }, t.name), h('span', { class: 'sc', style: { color: 'var(--green)' } }, num(t.score)))))));
        if (won) { confetti(5000); Sound.fanfare(); }
        localStorage.removeItem(KEY);
        return;
      }
      if (['question', 'locked', 'revealed'].includes(S.phase) && c.q) {
        const paper = h('section', { class: 'paper stage' });
        let tEl = null;
        if (S.phase === 'question' && c.deadline) { tEl = timerEl(); paper.append(h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, tEl)); }
        const canAnswer = S.answerMode === 'phones' && S.phase === 'question' && !S.myAnswer && S.status === 'running';
        qv = window.HimmaQ.render(c.q, { readonly: !canAnswer, external: { clueStep: c.clueStep, revealed: c.revealed }, onAnswer: send });
        paper.append(qv.el);
        if (S.phase === 'question' && S.myAnswer) paper.append(h('div', { class: 'feedback part' }, h('h3', null, 'أجاب فريقك' + (S.myAnswer.by ? ' (' + S.myAnswer.by + ')' : '')), 'بانتظار كشف الإجابة على الشاشة.'));
        if (S.phase === 'locked') paper.append(h('div', { class: 'feedback part' }, h('h3', null, 'انتهى الوقت'), 'بانتظار كشف الإجابة.'));
        if (S.phase === 'revealed') {
          const r = c.results && c.results[S.me.teamId];
          qv.showResult(r ? { detail: r.detail, correct: r.correct } : null, c.q);
          paper.append(h('div', { class: 'feedback ' + (r && r.correct ? 'ok' : r && r.fraction > 0 ? 'part' : 'no') },
            h('h3', null, r ? (r.correct ? 'إجابة صحيحة' : r.fraction > 0 ? 'إجابة جزئية' : 'إجابة غير صحيحة') + ' (' + (r.points >= 0 ? '+' : '') + num(r.points) + ')' : 'لم يجب فريقك'),
            h('div', { class: 'ans' }, 'الإجابة: ', c.answerText || ''),
            c.q.explanation ? h('p', { style: { margin: '.3rem 0 0' } }, c.q.explanation) : null,
            citations(c.citations, c.q.demo),
            c.learn ? h('div', { class: 'learn' }, h('div', { class: 't' }, '✦ معلومة جديدة'), c.learn.text, citations(c.learn.citations, c.learn.demo)) : null));
        }
        main.append(paper);
        if (tEl) {
          const total = (S.round.timer || 30) * 1000;
          const upd = () => tEl.set(c.remainingMs != null ? c.remainingMs : Math.max(0, c.deadline - (Date.now() + offset)), total);
          upd(); tick = setInterval(upd, 250);
        }
        return;
      }
      wait('بانتظار الخطوة التالية…');
    }
  }

  const s = saved();
  const code = params.get('code');
  if (s && s.token && (!code || code === s.code)) connect(s.sessionId, s.token);
  else codeForm(code || '');
})();
