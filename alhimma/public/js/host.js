/* المسابقة الجماعية: إنشاء الجلسة، شاشة العرض، لوحة تحكم المشرف */
(function () {
  'use strict';
  const { h, api, emblem, topbar, num, toast, Sound, citations, confetti, timerEl } = window.HimmaUI;
  const Engine = window.HimmaEngine;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const displayOnly = params.get('display') === '1';
  let cat;

  async function main() {
    cat = await api('/api/catalog');
    app.append(topbar('host'));
    const main = h('main', { class: 'wrap' });
    app.append(main);
    if (displayOnly && params.get('id')) return runSession(main, params.get('id'), true);
    const me = await api('/api/auth/me');
    if (!me.admin) return loginBox(main, me.configured);
    if (params.get('id')) return runSession(main, params.get('id'), false);
    setupForm(main);
  }

  function loginBox(main, configured) {
    const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', id: 'pw' });
    const go = async (e) => {
      e.preventDefault();
      try { await api('/api/auth/login', { body: { password: pw.value } }); location.reload(); } catch (er) { toast(er.message, 'err'); }
    };
    main.append(h('section', { class: 'paper login-box stage' },
      h('h2', null, 'إدارة المسابقة الجماعية'),
      configured
        ? h('form', { onsubmit: go }, h('p', { class: 'muted' }, 'المسابقة الجماعية يديرها المشرف. سجّل الدخول للمتابعة.'),
          h('div', { class: 'field' }, h('label', { for: 'pw' }, 'كلمة مرور المشرف'), pw), h('button', { class: 'btn btn-gold', type: 'submit' }, 'دخول'))
        : h('div', null, h('p', null, 'لم تُعدّ كلمة مرور المشرف بعد.'), h('a', { class: 'btn btn-gold', href: '/admin' }, 'إعداد المشرف')),
      h('p', { class: 'muted small', style: { marginTop: '1rem' } }, 'للمشاركين: ', h('a', { href: '/join', style: { color: 'var(--green)' } }, 'انضم برمز الجلسة'))));
    pw.focus();
  }

  /* ===== إنشاء جلسة ===== */
  async function setupForm(main) {
    const [sessions, comps] = await Promise.all([api('/api/sessions'), api('/api/admin/competitions')]);
    const active = sessions.filter((s) => s.status !== 'finished');
    const teamsBox = h('div', { style: { display: 'grid', gap: '.4rem' } });
    const addTeam = (name) => {
      const row = h('div', { class: 'row' }, h('input', { class: 'input team-name', value: name || '', placeholder: 'اسم الفريق', maxlength: 40, style: { flex: 1 } }),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', style: { color: '#2a2112' }, 'aria-label': 'حذف الفريق', onclick: () => row.remove() }, '✕'));
      teamsBox.append(row);
    };
    ['فريق الصديق', 'فريق الفاروق', 'فريق ذي النورين'].forEach(addTeam);
    const name = h('input', { class: 'input', value: 'مسابقة الهمّة — الطلعة الأولى', maxlength: 80, id: 'sname' });
    let mode = 'screen';
    const modeCtl = h('div', { class: 'seg-ctl' },
      h('button', { type: 'button', class: 'on', onclick: (e) => setMode('screen', e) }, 'شاشة واحدة'),
      h('button', { type: 'button', onclick: (e) => setMode('phones', e) }, 'من الهواتف (رمز / QR)'));
    function setMode(m, e) { mode = m; modeCtl.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); }
    const plan = h('select', { class: 'input', id: 'plan' },
      h('option', { value: 'grand' }, 'تحدي الهمّة الكبرى (٦ جولات متدرجة)'),
      comps.map((c) => h('option', { value: c.id }, c.name)),
      h('option', { value: 'custom' }, 'جولات مخصصة…'));
    const custom = h('div', { class: 'hidden', style: { display: 'grid', gap: '.4rem' } });
    const addRound = (type) => {
      const sel = h('select', { class: 'input r-type' }, Object.entries(cat.ROUND_TYPES).map(([k, v]) => h('option', { value: k, selected: k === type }, v.title)));
      const cnt = h('input', { class: 'input r-count', type: 'number', min: 1, max: 30, value: 3, style: { width: '90px' }, 'aria-label': 'عدد الأسئلة' });
      const br = h('select', { class: 'input r-cat' }, h('option', { value: '' }, 'كل الفروع'), cat.categories.map((c) => h('option', { value: c.id }, c.name)));
      const diff = h('select', { class: 'input r-diff' }, h('option', { value: '1,2,3' }, 'كل المستويات'), h('option', { value: '1' }, 'سهل'), h('option', { value: '2' }, 'متوسط'), h('option', { value: '3' }, 'صعب'));
      const row = h('div', { class: 'row r-row' }, sel, cnt, br, diff, h('button', { class: 'btn btn-sm btn-ghost', type: 'button', style: { color: '#2a2112' }, onclick: () => row.remove() }, '✕'));
      custom.insertBefore(row, custom.lastChild);
    };
    custom.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => addRound('standard') }, '+ جولة'));
    ['speed', 'discover', 'order', 'final'].forEach(addRound);
    plan.addEventListener('change', () => custom.classList.toggle('hidden', plan.value !== 'custom'));

    const create = async () => {
      const teams = [...teamsBox.querySelectorAll('.team-name')].map((i) => i.value.trim()).filter(Boolean);
      const body = { name: name.value, answerMode: mode, teams };
      if (plan.value === 'custom') {
        body.rounds = [...custom.querySelectorAll('.r-row')].map((r) => ({
          type: r.querySelector('.r-type').value, count: +r.querySelector('.r-count').value,
          categories: r.querySelector('.r-cat').value ? [r.querySelector('.r-cat').value] : null,
          difficulty: r.querySelector('.r-diff').value.split(',').map(Number),
        }));
      } else if (plan.value !== 'grand') body.competitionId = plan.value;
      try { const r = await api('/api/sessions', { body }); location.href = '/host?id=' + r.id; } catch (e) { toast(e.message, 'err'); }
    };

    main.append(h('div', { class: 'play-head' }, h('h1', null, 'المسابقة الجماعية')),
      active.length ? h('section', { class: 'panel stage', style: { marginBottom: '1rem' } }, h('h3', null, 'جلسات قائمة يمكن استكمالها'),
        h('div', { class: 'card-list' }, active.map((s) => h('div', { class: 'item-card row' },
          h('b', null, s.name), h('span', { class: 'badge badge-info' }, 'رمز ' + s.code), h('span', { class: 'muted small' }, s.teams.map((t) => t.name + ': ' + num(t.score)).join(' · ')),
          h('span', { class: 'spacer' }), h('a', { class: 'btn btn-sm btn-gold', href: '/host?id=' + s.id }, 'استكمال'))))) : null,
      h('section', { class: 'paper setup stage', style: { marginTop: 0 } },
        h('h2', null, 'جلسة جديدة'),
        h('div', { class: 'field' }, h('label', { for: 'sname' }, 'اسم المسابقة'), name),
        h('div', { class: 'field' }, h('label', null, 'طريقة الإجابة'), modeCtl,
          h('span', { class: 'muted small' }, 'شاشة واحدة: الفرق تتناوب على الإجابة على الشاشة المعروضة، ويمكن للمشرف منح النقاط يدويًا. الهواتف: يدخل المشاركون برمز الجلسة ويجيب كل فريق من هاتفه.')),
        h('div', { class: 'field' }, h('label', null, 'الفرق (أو أسماء اللاعبين للعب الفردي)'), teamsBox, h('button', { class: 'btn btn-sm', type: 'button', style: { justifySelf: 'start' }, onclick: () => addTeam('') }, '+ فريق')),
        h('div', { class: 'field' }, h('label', { for: 'plan' }, 'خطة الجولات'), plan, custom),
        h('div', { class: 'next-row' }, h('button', { class: 'btn btn-gold btn-lg', type: 'button', onclick: create }, 'إنشاء الجلسة'))));
  }

  /* ===== تشغيل الجلسة ===== */
  function runSession(main, id, readOnly) {
    let S = null, offset = 0, renderedKey = null, qv = null, tick = null, winnerShown = false, lastPhase = null;
    // عنوان الانضمام للهواتف: إذا فُتحت الشاشة على localhost نستعمل عنوان الجهاز في الشبكة المحلية
    let joinBase = location.origin;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
      api('/api/status').then((st) => { if (st.lan && st.lan[0]) { joinBase = st.lan[0]; if (S && S.phase === 'lobby') { renderedKey = null; render(); } } }).catch(() => {});
    }
    const stage = h('div', { class: 'stage-host' });
    const control = h('aside', { class: 'control' });
    main.append(h('div', { class: 'host-grid' + (readOnly ? ' display-only' : '') }, h('section', null, stage), readOnly ? null : control));

    const qs = readOnly ? '?code=' + encodeURIComponent(params.get('code') || '') : '?role=host';
    let es;
    const connect = () => {
      es = new EventSource('/api/sessions/' + id + '/stream' + qs);
      es.onmessage = (ev) => { S = JSON.parse(ev.data); offset = S.serverNow - Date.now(); render(); };
      es.onerror = () => { if (es.readyState === 2) { toast('انقطع الاتصال بالجلسة. أعد تحميل الصفحة.', 'err'); } };
    };
    connect();

    const act = async (type, extra) => {
      try { await api('/api/sessions/' + id + '/action', { body: { type, ...(extra || {}) } }); } catch (e) { toast(e.message, 'err'); }
    };

    function teamName(tid) { const t = S.teams.find((x) => x.id === tid); return t ? t.name : ''; }
    function remaining() { const c = S.current; if (!c || !c.deadline) return 0; if (c.remainingMs != null) return c.remainingMs; return Math.max(0, c.deadline - (Date.now() + offset)); }

    function board(big, results) {
      const sorted = S.teams.slice().sort((a, b) => b.score - a.score);
      return h('div', { class: big ? 'big-board' : 'scoreboard' }, sorted.map((t) => h('div', { class: 'team-row' + (S.current && S.current.turnTeamId === t.id && S.phase === 'question' && S.answerMode === 'screen' ? ' turn' : ''), style: { '--tc': t.color } },
        h('span', { class: 'nm' }, t.name),
        results && results[t.id] ? h('span', { class: results[t.id].points >= 0 ? 'badge badge-ok' : 'badge badge-bad' }, (results[t.id].points >= 0 ? '+' : '') + num(results[t.id].points)) : null,
        S.current && (S.current.answered || []).includes(t.id) && S.phase === 'question' ? h('span', { class: 'ok' }, '✓ أجاب') : null,
        h('span', { class: 'sc' }, num(t.score)))));
    }

    function render() {
      if (!S) return;
      const c = S.current || {};
      const key = S.phase + ':' + (c.qid || '') + ':' + S.status + ':' + (S.round ? S.round.index : '');
      if (S.phase !== lastPhase && S.phase === 'revealed') {
        const res = c.results || {};
        const anyOk = Object.values(res).some((r) => r && r.correct);
        if (anyOk) Sound.correct(); else if (Object.keys(res).length) Sound.wrong();
      }
      lastPhase = S.phase;
      if (key !== renderedKey) { renderedKey = key; renderStage(); }
      else updateDynamic();
      if (!readOnly) renderControl();
    }

    function updateDynamic() {
      const c = S.current || {};
      if (qv && qv.setStep && c.clueStep) qv.setStep(c.clueStep);
      if (qv && qv.setRevealed && c.revealed) qv.setRevealed(c.revealed);
      const strip = stage.querySelector('.answered-strip');
      if (strip) strip.replaceWith(answeredStrip());
      const sb = stage.querySelector('.scoreboard, .big-board');
      if (sb) sb.replaceWith(board(sb.classList.contains('big-board'), S.phase === 'revealed' ? c.results : null));
      const tb = stage.querySelector('.turn-badge');
      if (tb && c.turnTeamId) tb.textContent = 'دور: ' + teamName(c.turnTeamId);
      const bets = stage.querySelector('.bets');
      if (bets) bets.replaceWith(betsView());
    }

    function answeredStrip() {
      if (S.answerMode !== 'phones') return h('span');
      const ans = (S.current && S.current.answered) || [];
      return h('div', { class: 'answered-strip' }, S.teams.map((t) => h('span', { class: ans.includes(t.id) ? 'on' : '' }, t.name + (ans.includes(t.id) ? ' ✓' : ''))));
    }

    function betsView() {
      const bets = (S.current && S.current.bets) || {};
      return h('div', { class: 'bets big-board' }, S.teams.map((t) => h('div', { class: 'team-row', style: { '--tc': t.color } },
        h('span', { class: 'nm' }, t.name), h('span', { class: 'muted small' }, 'رصيده ' + num(t.score)),
        !readOnly && S.answerMode === 'screen'
          ? h('input', { class: 'input', type: 'number', min: 0, max: Math.max(0, t.score), value: bets[t.id] != null ? bets[t.id] : '', placeholder: 'الرهان', style: { width: '120px' }, 'aria-label': 'رهان ' + t.name,
            onchange: (e) => act('bet', { teamId: t.id, amount: e.target.value }) })
          : h('span', { class: 'sc' }, bets[t.id] != null ? num(bets[t.id]) : '…'))));
    }

    function renderStage() {
      clearInterval(tick); qv = null;
      stage.innerHTML = '';
      const c = S.current || {};
      const r = S.round;
      if (S.status === 'paused') stage.append(h('div', { class: 'demo-banner', style: { borderRadius: '12px', marginBottom: '.8rem' } }, 'المسابقة متوقفة مؤقتًا'));

      if (S.phase === 'lobby') {
        stage.append(h('section', { class: 'panel lobby stage' },
          h('h2', null, S.name),
          S.answerMode === 'phones'
            ? h('div', null, h('p', { class: 'muted' }, 'ادخل من هاتفك إلى صفحة الانضمام واكتب الرمز، أو امسح الرمز المربع'),
              h('div', { class: 'code', 'aria-label': 'رمز الجلسة' }, S.code),
              h('img', { class: 'qr', alt: 'رمز QR للانضمام', src: '/api/qr?text=' + encodeURIComponent(joinBase + '/join?code=' + S.code) }),
              h('p', { class: 'small muted', style: { direction: 'ltr' } }, joinBase + '/join'),
              h('p', null, num(S.playersCount) + ' مشاركًا انضموا'))
            : h('p', { class: 'muted' }, 'وضع الشاشة الواحدة: تتناوب الفرق على الإجابة.'),
          board(true)));
        return;
      }
      if (S.phase === 'intro' && r) {
        stage.append(h('section', { class: 'round-intro stage' },
          h('div', { class: 'num' }, 'الجولة ' + num(r.index + 1) + ' من ' + num(r.total)),
          h('h2', null, r.title),
          h('p', { class: 'muted' }, num(r.count) + ' أسئلة · ' + num(r.timer) + ' ثانية لكل سؤال' + (r.multiplier > 1 ? ' · النقاط مضاعفة' : '') + (r.risk ? ' · المراهنة على النقاط' : '')),
          board(true)));
        Sound.reveal();
        return;
      }
      if (S.phase === 'betting') {
        stage.append(h('section', { class: 'round-intro stage' },
          h('div', { class: 'num' }, r.title + ' — السؤال ' + num(S.qi + 1) + ' من ' + num(r.count)),
          h('h2', null, 'وقت المراهنة'),
          c.preview ? h('p', null, 'صعوبة السؤال: ', h('b', null, cat.DIFFICULTY[c.preview.difficulty].name), ' · النمط: ', h('b', null, (cat.MODES[c.preview.mode] || {}).title)) : null,
          h('p', { class: 'muted' }, S.answerMode === 'phones' ? 'يراهن كل فريق من هاتفه بجزء من نقاطه.' : 'أدخل رهان كل فريق.'),
          betsView()));
        return;
      }
      if (S.phase === 'finished') {
        stage.append(h('section', { class: 'round-intro stage' }, h('h2', null, 'النتائج النهائية'), board(true)));
        if (!winnerShown) { winnerShown = true; showWinner(); }
        return;
      }
      if (['question', 'locked', 'revealed'].includes(S.phase)) {
        const paper = h('section', { class: 'paper stage big' });
        const head = h('div', { class: 'row', style: { marginBottom: '.6rem' } },
          h('span', { class: 'badge badge-info' }, r.title + ' · ' + num(S.qi + 1) + '/' + num(r.count)));
        if (S.answerMode === 'screen' && c.turnTeamId && S.phase === 'question') head.append(h('span', { class: 'badge badge-ok turn-badge' }, 'دور: ' + teamName(c.turnTeamId)));
        if (c.cancelled) head.append(h('span', { class: 'badge badge-bad' }, 'أُلغي السؤال'));
        if (c.skipped) head.append(h('span', { class: 'badge badge-warn' }, 'تُجووز السؤال'));
        head.append(h('span', { class: 'spacer' }));
        let tEl = null;
        if (S.phase === 'question' && c.deadline) { tEl = timerEl(); head.append(tEl); }
        paper.append(head);
        if (c.missing || !c.q) { paper.append(h('div', { class: 'empty' }, h('b', null, 'السؤال غير متاح'), 'ربما حُذف من بنك الأسئلة.')); stage.append(paper); return; }
        const interactive = !readOnly && S.answerMode === 'screen' && S.phase === 'question';
        qv = window.HimmaQ.render(c.q, {
          big: true, readonly: !interactive,
          external: { clueStep: c.clueStep, revealed: c.revealed },
          onAnswer: (ans) => act('screenAnswer', { teamId: c.turnTeamId, answer: ans }),
          onSegment: (i) => !readOnly && act('segment', { index: i }),
        });
        paper.append(qv.el);
        if (c.q.type === 'card' && !readOnly && S.phase === 'question') paper.querySelectorAll('.seg').forEach((b) => b.removeAttribute('disabled'));
        if (S.phase === 'question') paper.append(answeredStrip());
        if (S.phase === 'locked') paper.append(h('div', { class: 'feedback part' }, h('h3', null, 'انتهى الوقت — بانتظار كشف الإجابة')));
        if (S.phase === 'revealed' && !c.skipped) {
          qv.showResult(null, c.q);
          const fb = h('div', { class: 'feedback ok' },
            h('h3', null, 'الإجابة الصحيحة'), h('div', { class: 'ans' }, c.answerText || ''),
            c.q.explanation ? h('p', { style: { margin: '.3rem 0 0' } }, c.q.explanation) : null,
            citations(c.citations, c.q.demo));
          if (c.learn) fb.append(h('div', { class: 'learn' }, h('div', { class: 't' }, '✦ معلومة جديدة'), h('div', null, c.learn.text), citations(c.learn.citations, c.learn.demo)));
          paper.append(fb);
        }
        stage.append(paper, h('div', { style: { height: '1rem' } }), board(false, S.phase === 'revealed' ? c.results : null));
        if (tEl) {
          const total = (r.timer || 30) * 1000;
          const upd = () => tEl.set(remaining(), total);
          upd(); tick = setInterval(upd, 250);
        }
      }
    }

    function showWinner() {
      const ranked = S.teams.slice().sort((a, b) => b.score - a.score);
      const winners = ranked.filter((t) => t.score === ranked[0].score);
      const ov = h('div', { class: 'winner', role: 'dialog', 'aria-label': 'إعلان الفائز' },
        h('div', null,
          emblem('crown', 'crown'),
          h('h2', null, winners.length > 1 ? 'تعادل في الصدارة' : 'الفائز بمسابقة الهمّة'),
          h('div', { class: 'tname' }, winners.map((w) => w.name).join(' و')),
          h('p', { class: 'muted' }, num(ranked[0].score) + ' نقطة'),
          h('div', { class: 'big-board', style: { maxWidth: '520px' } }, ranked.map((t, i) => h('div', { class: 'team-row', style: { '--tc': t.color } }, h('span', null, num(i + 1)), h('span', { class: 'nm' }, t.name), h('span', { class: 'sc' }, num(t.score))))),
          h('button', { class: 'btn btn-gold', type: 'button', onclick: () => ov.remove() }, 'إغلاق')));
      document.body.append(ov);
      confetti(7000); Sound.fanfare();
    }

    function renderControl() {
      const c = S.current || {};
      control.innerHTML = '';
      const nextLabel = { lobby: 'ابدأ المسابقة', intro: 'السؤال الأول', betting: 'اعرض السؤال', question: 'أغلق الإجابات', locked: 'اكشف الإجابة', revealed: 'التالي', finished: 'انتهت' }[S.phase];
      const isQ = ['question', 'locked'].includes(S.phase);
      control.append(
        h('div', { class: 'panel' },
          h('h3', null, S.name),
          h('div', { class: 'row small' }, h('span', { class: 'badge badge-info' }, 'رمز ' + S.code), h('span', { class: 'badge ' + (S.status === 'paused' ? 'badge-warn' : 'badge-ok') }, S.status === 'paused' ? 'متوقفة' : S.phaseName),
            S.round ? h('span', { class: 'muted' }, 'الجولة ' + num(S.round.index + 1) + '/' + num(S.round.total)) : null),
          h('div', { class: 'btns', style: { marginTop: '.8rem' } },
            h('button', { class: 'btn btn-gold wide', type: 'button', disabled: S.phase === 'finished' || S.status === 'paused', onclick: () => act('next'), title: 'Enter' }, nextLabel),
            c.q && c.q.type === 'reveal' && S.phase === 'question' ? h('button', { class: 'btn wide', type: 'button', disabled: c.clueStep >= c.q.data.clues.length, onclick: () => act('clue') }, 'اكشف تلميحًا (' + num(c.clueStep || 1) + '/' + num(c.q.data.clues.length) + ')') : null,
            isQ ? h('button', { class: 'btn btn-green', type: 'button', onclick: () => act('reveal') }, 'كشف الإجابة') : null,
            S.status === 'paused' ? h('button', { class: 'btn btn-green', type: 'button', onclick: () => act('resume') }, 'استئناف')
              : h('button', { class: 'btn', type: 'button', disabled: S.status !== 'running', onclick: () => act('pause'), title: 'P' }, 'إيقاف مؤقت'),
            h('button', { class: 'btn', type: 'button', disabled: !['question', 'locked', 'betting'].includes(S.phase), onclick: () => act('skip') }, 'تجاوز السؤال'),
            h('button', { class: 'btn', type: 'button', disabled: !c.qid || !['question', 'locked', 'revealed'].includes(S.phase), onclick: () => { if (confirm('إلغاء السؤال وإرجاع نقاطه؟')) act('cancel'); } }, 'إلغاء السؤال'),
            h('button', { class: 'btn btn-red', type: 'button', disabled: S.phase === 'finished', onclick: () => { if (confirm('إنهاء المسابقة وإعلان النتائج؟')) act('end'); } }, 'إنهاء'))),
        h('div', { class: 'panel' },
          h('h3', null, 'النقاط'),
          h('div', { class: 'scoreboard' }, S.teams.map((t) => h('div', { class: 'team-row' + (c.turnTeamId === t.id && S.answerMode === 'screen' ? ' turn' : ''), style: { '--tc': t.color } },
            h('span', { class: 'nm' }, t.name), h('span', { class: 'sc' }, num(t.score)),
            h('span', { class: 'adj' },
              S.answerMode === 'screen' && S.phase === 'question' ? h('button', { class: 'btn btn-sm', type: 'button', title: 'دوره', onclick: () => act('turn', { teamId: t.id }) }, 'دوره') : null,
              c.q && ['question', 'locked', 'revealed'].includes(S.phase) ? h('button', { class: 'btn btn-sm btn-green', type: 'button', title: 'إجابة صحيحة (منح كامل النقاط)', 'aria-label': 'منح ' + t.name + ' كامل النقاط', onclick: () => act('award', { teamId: t.id, fraction: 1 }) }, '✓') : null,
              h('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'تعديل نقاط ' + t.name, onclick: () => {
                const v = prompt('تعديل نقاط «' + t.name + '» (مثال: 50 أو -50)');
                if (v && parseInt(v, 10)) act('adjust', { teamId: t.id, delta: parseInt(v, 10), reason: 'تعديل المشرف' });
              } }, '±')))))),
        h('div', { class: 'panel small' },
          h('h3', null, 'شاشة العرض'),
          h('p', { class: 'muted' }, 'افتح شاشة عرض مستقلة للبروجيكتور، وتحكّم من هذا الجهاز.'),
          h('div', { class: 'row' },
            h('a', { class: 'btn btn-sm', href: '/host?id=' + S.id + '&display=1&code=' + S.code, target: '_blank', rel: 'noopener' }, 'فتح شاشة العرض'),
            h('a', { class: 'btn btn-sm btn-ghost', href: '/host' }, 'كل الجلسات'))),
        S.players && S.players.length ? h('div', { class: 'panel small' }, h('h3', null, 'المشاركون (' + num(S.players.length) + ')'),
          h('div', { class: 'card-list' }, S.players.map((p) => h('div', { class: 'row' }, h('span', null, p.name), h('span', { class: 'muted' }, teamName(p.teamId)), h('span', { class: 'spacer' }),
            h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => act('kick', { playerId: p.id }) }, 'إزالة'))))) : null,
        h('div', { class: 'panel small' }, h('h3', null, 'السجل'), h('div', { class: 'pre', style: { maxHeight: '180px' } }, (S.log || []).slice().reverse().map((l) => l.at.slice(11, 19) + '  ' + l.text).join('\n'))));
    }

    document.addEventListener('keydown', (e) => {
      if (readOnly || e.target.closest('input, textarea, select, button')) return;
      if (!S) return;
      if (e.key === 'Enter') { e.preventDefault(); act('next'); }
      if (e.key === 'p' || e.key === 'P' || e.key === 'ح') act(S.status === 'paused' ? 'resume' : 'pause');
    });
  }

  main().catch((e) => toast(e.message, 'err'));
})();
