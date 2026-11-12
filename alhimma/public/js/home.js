(function () {
  'use strict';
  const { h, api, emblem, topbar, demoBanner, num, toast, citations } = window.HimmaUI;
  const app = document.getElementById('app');

  async function main() {
    let cat;
    try { cat = await api('/api/catalog'); } catch (e) { app.append(topbar('home'), h('div', { class: 'wrap empty' }, h('b', null, 'تعذر تحميل المنصة'), e.message)); return; }
    const avail = cat.availability || {};
    const countFor = (modes) => modes.reduce((s, m) => s + (avail[m] ? avail[m].total : 0), 0);

    const hero = h('section', { class: 'hero' },
      h('div', { class: 'emblem', html: window.HimmaUI.LOGO.replace('class="mark"', 'class="mark" style="width:100%;height:auto"') }),
      h('h1', null, 'الهمّة'),
      h('div', { class: 'ornament-line', 'aria-hidden': 'true' }, '✦'),
      h('p', { class: 'slogan' }, 'بالعلم نرتقي، وبالهمّة نسمو'),
      h('p', { class: 'sub' }, 'مسابقات علمية تفاعلية مع أعلام الطبقة الخامسة من «سير أعلام النبلاء»: سيرهم ومواقفهم وأقوال النقاد فيهم، وكل معلومة موثقة بموضعها من الكتاب.'),
      h('div', { class: 'row cta' },
        h('a', { class: 'btn btn-gold btn-lg', href: '#games' }, 'ابدأ اللعب'),
        h('a', { class: 'btn btn-lg', href: '/host' }, 'مسابقة جماعية للفرق'),
        h('a', { class: 'btn btn-ghost btn-lg', href: '/join' }, 'انضم من جوالك')));

    // الألعاب: الثلاث ذات الأولوية أولًا
    const games = h('div', { class: 'games-grid' });
    for (const g of cat.GAMES) {
      const n = countFor(g.modes);
      games.append(h('a', { class: 'gtile' + (g.priority ? ' priority' : '') + (n ? '' : ' off'), href: '/play?game=' + g.id },
        h('span', { class: 'avail' }, n ? num(n) + ' سؤالًا' : 'قريبًا'), emblem(g.emblem), h('b', null, g.title), h('span', null, g.desc)));
    }
    const stages = cat.GRAND_PLAN.map((r) => cat.ROUND_TYPES[r.type].title);
    const grand = h('div', { class: 'bcard grand', style: { marginTop: '1rem', cursor: 'default' } },
      h('div', { class: 'grand-inner' }, emblem('crown'),
        h('div', { style: { flex: 1, minWidth: '240px' } },
          h('span', { class: 'cat' }, 'المنافسة الجامعة'),
          h('h3', null, '«تحدي الهمّة الكبرى»'),
          h('p', null, 'جولات متتابعة تجمع كل الألعاب، تشتد صعوبتها تدريجيًا: للفرق على الشاشة الكبيرة أو من الجوالات.'),
          h('div', { class: 'stages', style: { marginTop: '.7rem' } }, stages.map((s) => h('span', null, s)))),
        h('div', { class: 'row' }, h('a', { class: 'btn btn-gold', href: '/host' }, 'للفرق'), h('a', { class: 'btn', href: '/play?grand=1' }, 'العب منفردًا'))));

    // الأعلام مجمّعون بالطبقة
    const byLayer = {};
    for (const p of cat.persons) (byLayer[p.tabaqa || 0] = byLayer[p.tabaqa || 0] || []).push(p);
    const layers = Object.keys(byLayer).sort((a, b) => a - b).map((t) => h('div', null,
      h('div', { class: 'section-title' }, h('h2', null, +t ? 'أعلام الطبقة ' + ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'][+t] : 'أعلام آخرون'), h('p', null, num(byLayer[t].length) + ' أعلام')),
      +t === 5 ? h('div', { class: 'source-band' }, '📖', h('span', null, 'المصدر: «سير أعلام النبلاء» للإمام الذهبي، طبعة مؤسسة الرسالة، الجزء السادس — أول عشر تراجم من الطبقة الخامسة.')) : null,
      h('div', { class: 'persons-grid' }, byLayer[t].map((p, i) => h('button', { class: 'pcard', type: 'button', onclick: () => personModal(p.id) },
        h('span', { class: 'n' }, num(i + 1)), h('b', null, p.name), h('span', { class: 'd' }, 'الوفاة: ' + num(p.deathText)), h('p', null, num(p.bio)))))));

    app.append(
      topbar('home'), demoBanner(cat.demoInPlay),
      h('main', null, hero,
        h('div', { class: 'wrap' },
          h('div', { class: 'section-title', id: 'games' }, h('h2', null, 'ألعاب الهمّة'), h('p', { class: 'nav-opt' }, 'لكل لعبة أسلوبها')),
          games, grand, layers,
          h('div', { class: 'feature-band', style: { marginTop: '2rem' } },
            feature('توثيق كل سؤال', 'بعد كل إجابة: شرح مختصر، واسم الكتاب والجزء ونطاق صفحات الترجمة، ورابط بداية الترجمة.'),
            feature('أمانة في الخلاف', 'ما اختلف فيه النقاد يُعرض بأقوالهم كما وردت، وما يحتاج تحقيقًا لا يدخل الأسئلة.'),
            feature('فرق ونقاط وجولات', 'شاشة كبيرة للعرض، ودخول من الجوال برمز أو QR، ومؤقت ولوحة نتائج مباشرة.'),
            feature('يعمل دون إنترنت', 'شغّل المنصة على حاسوب واحد، وتنضم الجوالات عبر شبكته المحلية.')))),
      h('footer', { class: 'foot' }, h('div', { class: 'wrap' }, 'الهمّة — بالعلم نرتقي، وبالهمّة نسمو · الطلعة الأولى')));
  }

  async function personModal(id) {
    let p;
    try { p = await api('/api/persons/' + id); } catch (e) { return toast(e.message, 'err'); }
    const back = h('div', { class: 'modal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': p.name });
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.append(h('div', { class: 'modal' },
      h('div', { class: 'row' }, h('h2', { style: { margin: 0 } }, p.name), h('span', { class: 'spacer' }), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: close, 'aria-label': 'إغلاق' }, '✕')),
      h('p', { class: 'muted small', style: { margin: '.2rem 0' } }, 'الوفاة: ' + num(p.deathText || 'غير محددة')),
      h('ul', { class: 'facts' }, p.facts.map((f) => h('li', null, h('small', null, f.kindName), num(f.text)))),
      p.underReview ? h('p', { class: 'small', style: { color: '#e0b357' } }, '⚠ ' + num(p.underReview) + ' معلومة في الترجمة تحتاج تحقيقًا، فلم تُعرض ولم تُبنَ عليها أسئلة.') : null,
      citations(p.citations)));
    document.body.append(back);
    back.querySelector('button').focus();
  }

  function feature(t, p) { return h('div', { class: 'feature' }, h('b', null, t), h('p', null, p)); }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  main().catch((e) => toast(e.message, 'err'));
})();
