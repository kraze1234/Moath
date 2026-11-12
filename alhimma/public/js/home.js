(function () {
  'use strict';
  const { h, api, emblem, topbar, demoBanner, num, toast } = window.HimmaUI;
  const app = document.getElementById('app');

  async function main() {
    let cat;
    try { cat = await api('/api/catalog'); } catch (e) { app.append(topbar('home'), h('div', { class: 'wrap empty' }, h('b', null, 'تعذر تحميل المنصة'), e.message)); return; }
    const catName = Object.fromEntries(cat.categories.map((c) => [c.id, c.name]));
    const avail = cat.availability || {};
    const countFor = (modes, catId) => modes.reduce((s, m) => s + (avail[m] ? (catId ? avail[m].byCat[catId] || 0 : avail[m].total) : 0), 0);
    const hasDemo = cat.demoInPlay;

    const hero = h('section', { class: 'hero' },
      h('div', { class: 'emblem', html: window.HimmaUI.LOGO.replace('class="mark"', 'class="mark" style="width:100%;height:auto"') }),
      h('h1', null, 'الهمّة'),
      h('div', { class: 'ornament-line', 'aria-hidden': 'true' }, '✦'),
      h('p', { class: 'slogan' }, 'بالعلم نرتقي، وبالهمّة نسمو'),
      h('p', { class: 'sub' }, 'منصة مسابقات علمية تفاعلية تأخذك في رحلة مع أعلام التاريخ الإسلامي: سيرهم وطبقاتهم ومؤلفاتهم ومواقفهم، بمعلومات موثقة من مصادرها.'),
      h('div', { class: 'row cta' },
        h('a', { class: 'btn btn-gold btn-lg', href: '#branches' }, 'ابدأ الرحلة'),
        h('a', { class: 'btn btn-lg', href: '/host' }, 'مسابقة جماعية'),
        h('a', { class: 'btn btn-ghost btn-lg', href: '/join' }, 'انضم برمز')));

    const branches = h('div', { class: 'branch-grid' });
    for (const b of cat.BRANCHES) {
      const n = countFor(b.modes, b.category);
      branches.append(h('a', { class: 'bcard', href: '/play?branch=' + b.id, style: { '--accent': b.accent } },
        emblem(b.emblem),
        h('span', { class: 'cat' }, 'فرع ' + (catName[b.category] || '')),
        h('h3', null, '«' + b.title + '»'),
        h('p', null, b.tagline),
        h('div', { class: 'modes' }, b.modes.map((m) => h('span', null, cat.MODES[m].title))),
        h('span', { class: 'small muted' }, n ? num(n) + ' تحديًا جاهزًا' : 'بانتظار اعتماد المحتوى')));
    }
    const stages = cat.GRAND_PLAN.map((r) => cat.ROUND_TYPES[r.type].title);
    branches.append(h('a', { class: 'bcard grand', href: '/play?grand=1' },
      h('div', { class: 'grand-inner' }, emblem('crown'),
        h('div', { style: { flex: 1, minWidth: '240px' } },
          h('span', { class: 'cat' }, 'الفرع الجامع'),
          h('h3', null, '«تحدي الهمّة الكبرى»'),
          h('p', null, 'منافسة متعددة المراحل تجمع كل الفروع، وتشتد صعوبتها جولة بعد جولة.'),
          h('div', { class: 'stages', style: { marginTop: '.7rem' } }, stages.map((s) => h('span', null, s)))),
        h('div', { class: 'row' }, h('span', { class: 'btn btn-gold' }, 'العب منفردًا'), h('span', { class: 'btn', onclick: (e) => { e.preventDefault(); location.href = '/host'; } }, 'للفرق')))));

    const games = h('div', { class: 'games-grid' });
    for (const g of cat.GAMES) {
      const modes = g.modes === '*' ? Object.keys(cat.MODES) : g.modes;
      const n = countFor(modes);
      games.append(h('a', { class: 'gtile' + (n ? '' : ' off'), href: '/play?game=' + g.id, title: n ? '' : 'لا توجد أسئلة معتمدة لهذه اللعبة بعد' },
        h('span', { class: 'avail' }, n ? num(n) : 'قريبًا'), emblem(g.emblem), h('b', null, g.title), h('span', null, g.desc)));
    }

    const features = h('div', { class: 'feature-band' },
      feature('توثيق قبل النشر', 'كل معلومة مربوطة بمصدرها، ولا يظهر في المسابقات إلا ما اعتمده المشرف بعد المراجعة العلمية.'),
      feature('للطلعات والاجتماعات', 'فرق بأسماء مخصصة، شاشة عرض واحدة أو دخول من الهواتف برمز الجلسة أو QR، ومؤقت ولوحة نتائج مباشرة.'),
      feature('يعمل دون إنترنت', 'شغّل المنصة على جهاز واحد، وتنضم الهواتف عبر شبكة الجهاز المحلية دون حاجة إلى الإنترنت.'),
      feature('تعلّم بعد كل سؤال', 'شرح مختصر ومعلومة جديدة موثقة عن الشخصية بعد كل إجابة.'));

    app.append(
      topbar('home'), demoBanner(hasDemo),
      h('main', null,
        hero,
        h('div', { class: 'wrap' },
          h('div', { class: 'section-title', id: 'branches' }, h('h2', null, 'فروع المسابقة'), h('p', { class: 'nav-opt' }, 'لكل فرع لعبته وطابعه')),
          branches,
          h('div', { class: 'section-title' }, h('h2', null, 'ألعاب الهمّة'), h('p', null, 'تحديات مبتكرة عبر كل الطبقات')),
          games,
          h('div', { class: 'section-title' }, h('h2', null, 'لماذا الهمّة؟')),
          features)),
      h('footer', { class: 'foot' }, h('div', { class: 'wrap' }, 'الهمّة — بالعلم نرتقي، وبالهمّة نسمو · الطلعة الأولى')));
  }

  function feature(t, p) { return h('div', { class: 'feature' }, h('b', null, t), h('p', null, p)); }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  main().catch((e) => toast(e.message, 'err'));
})();
