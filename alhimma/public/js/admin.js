/* لوحة الإدارة — الأعلام، التصنيفات، المصادر، الاستيراد، المراجعة، الأسئلة، المسابقات، النتائج، النسخ الاحتياطي */
(function () {
  'use strict';
  const { h, api, topbar, num, toast } = window.HimmaUI;
  const AR = window.HimmaArabic;
  const Engine = window.HimmaEngine;
  let C; // الكتالوج
  const app = document.getElementById('app');
  const cache = {};

  const STATUS_BADGE = { draft: 'badge-info', review: 'badge-warn', approved: 'badge-ok', rejected: 'badge-bad' };
  const statusBadge = (s) => h('span', { class: 'badge ' + (STATUS_BADGE[s] || '') }, C.STATUS[s] || s || '—');
  const demoBadge = (x) => (x && x.demo ? h('span', { class: 'badge badge-demo' }, 'تجريبي') : null);
  const MADHHABS = ['الحنفي', 'المالكي', 'الشافعي', 'الحنبلي'];

  async function load(col, force) { if (force || !cache[col]) cache[col] = await api('/api/admin/' + col); return cache[col]; }
  const invalidate = (...cols) => cols.forEach((c) => delete cache[c]);

  /* ===== نافذة منبثقة ===== */
  function modal(title, content, actions) {
    const back = h('div', { class: 'modal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const box = h('div', { class: 'modal dark' }, h('div', { class: 'row' }, h('h2', { style: { margin: 0 } }, title), h('span', { class: 'spacer' }), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: close, 'aria-label': 'إغلاق' }, '✕')), content,
      actions ? h('div', { class: 'foot' }, actions(close)) : null);
    back.append(box);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.body.append(back);
    const f = box.querySelector('input, select, textarea');
    if (f) f.focus();
    return close;
  }
  const field = (label, input, hint) => h('div', { class: 'field' }, h('label', null, label), input, hint ? h('span', { class: 'muted small' }, hint) : null);
  const inp = (val, attrs) => h('input', { class: 'input', value: val == null ? '' : val, ...(attrs || {}) });
  const sel = (options, val, attrs) => h('select', { class: 'input', ...(attrs || {}) }, options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(val == null ? '' : val) }, t)));
  const area = (val, attrs) => h('textarea', { class: 'input', ...(attrs || {}) }, val == null ? '' : val);

  /* ===== الدخول ===== */
  async function boot() {
    C = await api('/api/catalog');
    const me = await api('/api/auth/me');
    app.append(topbar('admin', null));
    if (!me.admin) return loginScreen(me.configured);
    shell();
  }

  function loginScreen(configured) {
    const pw = inp('', { type: 'password', autocomplete: configured ? 'current-password' : 'new-password', id: 'pw' });
    const pw2 = inp('', { type: 'password', autocomplete: 'new-password', id: 'pw2' });
    const submit = async (e) => {
      e.preventDefault();
      try {
        if (!configured) {
          if (pw.value !== pw2.value) return toast('كلمتا المرور غير متطابقتين', 'err');
          await api('/api/auth/setup', { body: { password: pw.value } });
        } else await api('/api/auth/login', { body: { password: pw.value } });
        location.reload();
      } catch (er) { toast(er.message, 'err'); }
    };
    app.append(h('main', { class: 'wrap' }, h('section', { class: 'paper login-box stage' },
      h('h2', null, configured ? 'دخول المشرف' : 'إعداد حساب المشرف'),
      !configured ? h('p', { class: 'muted' }, 'أول تشغيل: اختر كلمة مرور للوحة الإدارة (٨ أحرف على الأقل). احفظها في مكان آمن.') : null,
      h('form', { onsubmit: submit }, field('كلمة المرور', pw), !configured ? field('تأكيد كلمة المرور', pw2) : null,
        h('button', { class: 'btn btn-gold', type: 'submit' }, configured ? 'دخول' : 'إنشاء وحفظ')))));
    pw.focus();
  }

  /* ===== الهيكل ===== */
  const SECTIONS = [
    ['dash', 'لوحة عامة', null], ['persons', 'الأعلام', 'المحتوى'], ['categories', 'التصنيفات والطبقات'], ['events', 'الوقائع والأماكن'], ['terms', 'المصطلحات'],
    ['sources', 'المصادر', 'التوثيق'], ['import', 'الاستيراد'], ['review', 'المراجعة والتعارضات'],
    ['questions', 'بنك الأسئلة', 'المسابقات'], ['competitions', 'تخصيص المسابقات'], ['teams', 'الفرق'], ['results', 'الجلسات والنتائج'],
    ['backup', 'النسخ الاحتياطي', 'النظام'], ['settings', 'الإعدادات'],
  ];
  let mainEl, navEl, overview;

  function shell() {
    navEl = h('nav', { class: 'side', 'aria-label': 'أقسام الإدارة' });
    mainEl = h('main', { id: 'adm' });
    app.append(h('div', { class: 'admin' }, navEl, mainEl));
    window.addEventListener('hashchange', route);
    route();
  }

  async function paintNav(cur) {
    try { overview = await api('/api/admin/overview'); } catch (e) { if (e.status === 401) return location.reload(); }
    const cnt = { review: overview ? overview.pending.claims + overview.conflicts : 0, questions: overview ? overview.pending.questions : 0, import: overview ? overview.pending.imports : 0, persons: overview ? overview.pending.persons : 0 };
    navEl.innerHTML = '';
    for (const [id, title, grp] of SECTIONS) {
      if (grp) navEl.append(h('div', { class: 'grp' }, grp));
      navEl.append(h('a', { href: '#/' + id, class: id === cur ? 'on' : '' }, title, cnt[id] ? h('span', { class: 'cnt' }, num(cnt[id])) : null));
    }
    navEl.append(h('div', { class: 'grp' }, 'الحساب'), h('a', { href: '#', onclick: async (e) => { e.preventDefault(); await api('/api/auth/logout', { body: {} }); location.href = '/'; } }, 'تسجيل الخروج'));
  }

  let routeSeq = 0;
  async function route() {
    const seq = ++routeSeq;
    const [, sec, arg] = (location.hash || '#/dash').split('/');
    const id = SECTIONS.some((s) => s[0] === sec) ? sec : 'dash';
    await paintNav(id);
    if (seq !== routeSeq) return; // تنقل أحدث بدأ
    const fresh = h('main', { id: 'adm' });
    mainEl.replaceWith(fresh);
    mainEl = fresh;
    try { await (VIEWS[id] || VIEWS.dash)(arg); } catch (e) { if (e.status === 401) return location.reload(); if (seq === routeSeq) mainEl.append(h('div', { class: 'empty route-error' }, h('b', null, 'خطأ'), e.message)); }
    mainEl.focus && mainEl.setAttribute('tabindex', '-1');
  }

  const title = (t, ...extra) => mainEl.append(h('div', { class: 'row', style: { marginBottom: '1rem' } }, h('h1', { style: { margin: 0 } }, t), h('span', { class: 'spacer' }), ...extra));

  /* ===== محرر الإحالات ===== */
  function citationsEditor(list, sources) {
    const box = h('div');
    const rows = [];
    const add = (c) => {
      c = c || {};
      const s = sel([['', '— المصدر —'], ...sources.map((x) => [x.id, x.title + (x.author ? ' — ' + x.author : '')])], c.sourceId);
      const vol = inp(c.vol, { placeholder: 'ج', inputmode: 'numeric', 'aria-label': 'الجزء' });
      const page = inp(c.page, { placeholder: 'ص', inputmode: 'numeric', 'aria-label': 'الصفحة' });
      const sp = inp(c.pages, { placeholder: 'نطاق الصفحات 255–269', 'aria-label': 'نطاق الصفحات', title: 'إن لم تُعرف الصفحة الدقيقة فاكتب نطاق صفحات الترجمة' });
      const ex = area(c.excerpt, { placeholder: 'نص المقتطف من المصدر (اختياري — يُستعمل في لعبة الباحث الصغير)', style: { minHeight: '50px' } });
      const url = inp(c.url, { placeholder: 'رابط بداية الترجمة (للتوثيق فقط)', style: { direction: 'ltr' } });
      const row = h('div', { class: 'item-card' }, h('div', { class: 'cit-row' }, s, vol, page, sp, h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => { row.remove(); rows.splice(rows.indexOf(rec), 1); } }, '✕')), url, h('div', { style: { height: '.3rem' } }), ex);
      const rec = { row, get: () => ({ sourceId: s.value || null, vol: vol.value ? +AR.toLatinDigits(vol.value) : null, page: page.value ? +AR.toLatinDigits(page.value) : null, pages: sp.value.trim() ? AR.toLatinDigits(sp.value.trim()).replace('-', '–') : null, url: url.value.trim() || null, urlLabel: c.urlLabel || (url.value.trim() ? 'رابط بداية الترجمة' : null), personName: c.personName || null, excerpt: ex.value.trim() || null, documentId: c.documentId || null }) };
      rows.push(rec);
      box.insertBefore(row, addBtn);
    };
    const addBtn = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => add() }, '+ إحالة إلى مصدر');
    box.append(addBtn);
    (list || []).forEach(add);
    box.get = () => rows.map((r) => r.get()).filter((c) => c.sourceId || c.url || c.excerpt);
    return box;
  }

  /* ===== محرر المعلومة (claim) ===== */
  async function claimEditor(claim, personId, onSaved) {
    const [persons, sources, places] = await Promise.all([load('persons'), load('sources'), load('places')]);
    claim = claim || { kind: 'death', value: {}, citations: [], status: 'review', personId };
    const kind = sel(Object.entries(C.CLAIM_KINDS), claim.kind);
    const valueBox = h('div');
    let getValue = () => ({});
    const paintValue = () => {
      valueBox.innerHTML = '';
      const v = claim.kind === kind.value ? claim.value || {} : {};
      switch (kind.value) {
        case 'death': case 'birth': {
          const y = inp(v.year, { inputmode: 'numeric', placeholder: 'السنة الهجرية' });
          const ap = h('input', { type: 'checkbox', checked: !!v.approx });
          valueBox.append(field('السنة (هـ)', y), h('label', { class: 'row small' }, ap, 'تقريبية'));
          getValue = () => ({ year: +AR.toLatinDigits(y.value), approx: ap.checked }); break;
        }
        case 'work': { const t = inp(v.title, { placeholder: 'عنوان الكتاب' }); valueBox.append(field('عنوان المؤلَّف', t)); getValue = () => ({ title: t.value.trim() }); break; }
        case 'teacher': {
          const t = sel([['', '— اختر الشيخ —'], ...persons.filter((p) => p.id !== personId).map((p) => [p.id, p.name])], v.personId);
          valueBox.append(field('الشيخ (العلم الذي تتلمذ عليه)', t)); getValue = () => ({ personId: t.value }); break;
        }
        case 'place': {
          const n = inp(v.name), r = inp(v.relation || 'ارتبط اسمه ب');
          const pl = sel([['', '— ربط بمكان على الخريطة (اختياري) —'], ...places.map((p) => [p.id, p.name])], v.placeId);
          valueBox.append(field('البلد', n), field('صيغة العلاقة', r, 'مثل: ولد في، نشأ في، توفي في، ارتبط اسمه ب'), pl);
          getValue = () => ({ name: n.value.trim(), relation: r.value.trim(), placeId: pl.value || null }); break;
        }
        case 'madhhab': { const m = inp(v.name, { list: 'mlist' }); valueBox.append(field('المذهب', m), h('datalist', { id: 'mlist' }, MADHHABS.map((x) => h('option', { value: x })))); getValue = () => ({ name: m.value.trim() }); break; }
        case 'quote': { const t = area(v.text); valueBox.append(field('نص المقولة كما ورد في المصدر', t, 'لا تُعتمد المقولة دون إحالة موثقة.')); getValue = () => ({ text: t.value.trim() }); break; }
        case 'stance': { const t = area(v.text), l = inp(v.lesson); valueBox.append(field('الموقف', t), field('الدرس المستفاد (اختياري)', l)); getValue = () => ({ text: t.value.trim(), lesson: l.value.trim() || null }); break; }
        default: { const t = area(v.text); valueBox.append(field('النص', t)); getValue = () => ({ text: t.value.trim() }); }
      }
    };
    kind.addEventListener('change', paintValue);
    paintValue();
    const cites = citationsEditor(claim.citations, sources);
    const status = sel(Object.entries(C.STATUS), claim.status);
    const note = inp(claim.note, { placeholder: 'ملاحظة للمراجعة' });
    modal(claim.id ? 'تعديل معلومة' : 'معلومة جديدة', h('div', null, field('نوع المعلومة', kind), valueBox, h('h3', { class: 'small', style: { color: 'var(--gold-2)' } }, 'المصادر'), cites, h('div', { style: { height: '.8rem' } }),
      h('div', { class: 'cols-2' }, field('الحالة', status), field('ملاحظة', note)),
      claim.demo ? h('p', { class: 'small muted' }, 'هذه معلومة تجريبية؛ عند توثيقها بمصدر وحفظها تُزال عنها صفة «تجريبي».') : null),
    (close) => [h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
      const body = { personId: claim.personId || personId, kind: kind.value, value: getValue(), citations: cites.get(), status: status.value, note: note.value };
      if (body.status === 'approved' && !body.citations.length && !claim.demo && !confirm('لا توجد إحالة لهذه المعلومة. اعتمادها دون مصدر مخالف لمنهج المنصة. هل تريد المتابعة؟')) return;
      if (claim.demo && body.citations.length) body.clearDemo = true;
      try {
        if (claim.id) await api('/api/admin/claims/' + claim.id, { method: 'PUT', body }); else await api('/api/admin/claims', { body });
        invalidate('claims'); toast('حُفظت المعلومة', 'ok'); close(); onSaved && onSaved();
      } catch (e) { toast(e.message, 'err'); }
    } }, 'حفظ')]);
  }

  function claimSummary(c, personsById) {
    const v = c.value || {};
    switch (c.kind) {
      case 'death': case 'birth': return num(v.year) + 'هـ' + (v.approx ? ' (تقريبًا)' : '');
      case 'work': return '«' + v.title + '»';
      case 'teacher': return 'تتلمذ على: ' + ((personsById[v.personId] || {}).name || '؟');
      case 'place': return AR.placePhrase(v.relation, v.name);
      case 'madhhab': return v.name;
      case 'stance': return v.text + (v.lesson ? ' — الدرس: ' + v.lesson : '');
      default: return v.text || JSON.stringify(v);
    }
  }
  function citeText(c, sourcesById) {
    if (!c.citations || !c.citations.length) return h('span', { class: 'badge badge-bad' }, 'بلا مصدر');
    return h('span', { class: 'small muted' }, c.citations.map((x) => {
      const s = sourcesById[x.sourceId];
      return (s ? s.title : x.url ? 'رابط' : 'مقتطف') + (x.vol ? ' ج' + num(x.vol) : '') + (x.page ? ' ص' + num(x.page) : x.pages ? ' ص' + num(x.pages) : '');
    }).join('؛ '));
  }

  const VIEWS = {};

  /* ===== لوحة عامة ===== */
  VIEWS.dash = async () => {
    const o = overview;
    title('لوحة عامة');
    const c = o.counts;
    mainEl.append(h('div', { class: 'stat-grid' },
      stat(c.persons, 'علمًا'), stat(c.claims, 'معلومة موثقة/قيد التوثيق'), stat(c.sources, 'مصدرًا'), stat(c.documents, 'نصًا مستوردًا'),
      stat(c.usableQuestions, 'سؤالًا جاهزًا للعب'), stat(c.questions, 'سؤالًا في البنك')));
    const todo = h('div', { class: 'card-list' });
    const item = (n, t, href, kind) => n ? todo.append(h('a', { class: 'item-card row', href, style: { textDecoration: 'none', color: 'inherit' } }, h('span', { class: 'badge ' + (kind || 'badge-warn') }, num(n)), t, h('span', { class: 'spacer' }), '←')) : null;
    item(o.pending.persons, 'أعلام بانتظار المراجعة والاعتماد', '#/persons');
    item(o.pending.claims, 'معلومات بانتظار المراجعة', '#/review');
    item(o.conflicts, 'تعارضات بين المصادر تحتاج قرارك', '#/review', 'badge-bad');
    item(o.pending.questions, 'أسئلة مسودة بانتظار الاعتماد', '#/questions');
    item(o.pending.imports, 'قوائم مستوردة لم تُطبق بعد', '#/import');
    item(o.pending.unsourcedApproved, 'معلومات معتمدة بلا مصدر (يُنصح بتوثيقها)', '#/review', 'badge-bad');
    if (!todo.children.length) todo.append(h('div', { class: 'empty' }, 'لا توجد مهام معلقة.'));
    mainEl.append(h('div', { class: 'cols-2' },
      h('section', { class: 'panel' }, h('h3', null, 'مهام المراجعة'), todo),
      h('section', { class: 'panel' }, h('h3', null, 'تشغيل المسابقة'),
        h('p', { class: 'muted small' }, 'روابط الدخول للهواتف على الشبكة المحلية:'),
        h('div', { class: 'pre', style: { direction: 'ltr' } }, (o.lan.length ? o.lan : [location.origin]).join('\n')),
        h('div', { class: 'row', style: { marginTop: '.8rem' } }, h('a', { class: 'btn btn-gold btn-sm', href: '/host' }, 'مسابقة جماعية جديدة'), h('a', { class: 'btn btn-sm', href: '/' }, 'الصفحة الرئيسية')),
        null)));
  };
  const stat = (n, t) => h('div', { class: 'stat' }, h('b', null, num(n)), h('span', null, t));

  /* ===== الأعلام ===== */
  VIEWS.persons = async (arg) => {
    if (arg) return personDetail(arg);
    const [persons, claims] = await Promise.all([load('persons', true), load('claims', true)]);
    const catName = Object.fromEntries(C.categories.map((c) => [c.id, c.name]));
    const deathOf = {};
    for (const c of claims) if (c.kind === 'death' && c.status !== 'rejected') (deathOf[c.personId] = deathOf[c.personId] || new Set()).add(c.value.year);
    title('الأعلام', h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => personForm(null) }, '+ علم جديد'),
      h('a', { class: 'btn btn-sm', href: '/api/admin/export/persons.csv' }, 'تصدير CSV'));
    const q = inp('', { class: 'input search', placeholder: 'بحث بالاسم أو الصيغ البديلة…', type: 'search' });
    const fc = sel([['', 'كل التصنيفات'], ...C.categories.map((c) => [c.id, c.name])], '');
    const fs = sel([['', 'كل الحالات'], ...Object.entries(C.STATUS)], '');
    const tabs = [...new Set(persons.map((p) => p.tabaqa).filter(Boolean))].sort((a, b) => a - b);
    const fd = sel([['', 'كل الطبقات'], ...tabs.map((t) => [String(t), 'الطبقة ' + num(t)])], '');
    const sort = sel([['death', 'ترتيب بسنة الوفاة'], ['name', 'ترتيب أبجدي'], ['new', 'الأحدث إضافة']], 'death');
    const tbody = h('tbody');
    mainEl.append(h('div', { class: 'toolbar dark' }, q, fc, fs, fd, sort), h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['الاسم', 'التصنيفات', 'الوفاة', 'المعلومات', 'الحالة', ''].map((t) => h('th', null, t)))), tbody)));
    const paint = () => {
      const k = AR.normalize(q.value);
      let list = persons.filter((p) => (!k || AR.normalize([p.name, ...(p.aliases || [])].join(' ')).includes(k)) && (!fc.value || (p.categories || []).includes(fc.value)) &&
        (!fs.value || p.status === fs.value) && (!fd.value || String(p.tabaqa) === fd.value));
      const dy = (p) => { const s = deathOf[p.id]; return s && s.size === 1 ? [...s][0] : s && s.size > 1 ? -1 : 99999; };
      if (sort.value === 'death') list.sort((a, b) => dy(a) - dy(b));
      if (sort.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      if (sort.value === 'new') list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      tbody.innerHTML = '';
      for (const p of list.slice(0, 500)) {
        const s = deathOf[p.id];
        tbody.append(h('tr', null,
          h('td', null, h('a', { href: '#/persons/' + p.id }, p.name), ' ', demoBadge(p), (p.aliases || []).length ? h('div', { class: 'small muted' }, p.aliases.join('، ')) : null),
          h('td', null, (p.categories || []).map((c, i) => h('span', { class: 'badge ' + (c === p.primaryCategory ? 'badge-ok' : 'badge-info'), style: { marginInlineEnd: '.2rem' } }, catName[c] || c, i === 0 && c === p.primaryCategory ? ' ★' : ''))),
          h('td', null, p.deathText ? h('div', { class: 'small' }, num(p.deathText)) : null, p.tabaqa ? h('div', { class: 'small muted' }, 'الطبقة ' + num(p.tabaqa)) : null, !s ? h('span', { class: 'muted small' }, p.deathText ? '' : 'غير محددة') : s.size > 1 ? h('span', { class: 'badge badge-bad' }, 'تعارض: ' + [...s].map(num).join(' / ')) : num([...s][0]) + 'هـ'),
          h('td', null, num(claims.filter((c) => c.personId === p.id).length)),
          h('td', null, statusBadge(p.status)),
          h('td', { class: 'actions' }, h('a', { class: 'btn btn-sm', href: '#/persons/' + p.id }, 'فتح'))));
      }
      if (!list.length) tbody.append(h('tr', null, h('td', { colspan: 6, class: 'empty' }, 'لا نتائج')));
    };
    [q, fc, fs, fd, sort].forEach((e) => e.addEventListener('input', paint));
    paint();
  };

  async function personForm(p, onSaved) {
    p = p || { name: '', aliases: [], categories: [], primaryCategory: null, level: 2, bio: '', status: 'review' };
    const sources = await load('sources');
    const name = inp(p.name, { placeholder: 'الاسم المشهور' });
    const full = inp(p.fullName, { placeholder: 'الاسم الكامل (اختياري)' });
    const aliases = inp((p.aliases || []).join('، '), { placeholder: 'صيغ بديلة يفصل بينها بفاصلة' });
    const cats = h('div', { class: 'row' }, C.categories.map((c) => h('label', { class: 'row small', style: { gap: '.3rem' } }, h('input', { type: 'checkbox', value: c.id, checked: (p.categories || []).includes(c.id) }), c.name)));
    const primary = sel([['', '— التصنيف الرئيسي —'], ...C.categories.map((c) => [c.id, c.name])], p.primaryCategory);
    const level = sel([[1, 'مشهور (سهل)'], [2, 'متوسط'], [3, 'أقل شهرة (صعب)']], p.level || 2);
    const tabaqa = inp(p.tabaqa, { inputmode: 'numeric', placeholder: 'مثل: 5' });
    const deathText = inp(p.deathText, { placeholder: 'مثل: 139 أو 140هـ / نحو 152–160هـ / غير محددة' });
    const bio = area(p.bio, { placeholder: 'نبذة علمية مختصرة — تُكتب من المصادر وتُوثق بالإحالات أدناه' });
    const bioC = citationsEditor(p.bioCitations, sources);
    const status = sel(Object.entries(C.STATUS), p.status);
    modal(p.id ? 'تعديل بيانات العلم' : 'علم جديد', h('div', null,
      h('div', { class: 'cols-2' }, field('الاسم', name), field('الاسم الكامل', full)), field('الصيغ البديلة', aliases),
      field('التصنيفات', cats, 'قد يكون العلم محدثًا وفقيهًا وزاهدًا معًا: اختر كل ما يناسب، وحدد الرئيسي.'),
      h('div', { class: 'cols-2' }, field('التصنيف الرئيسي', primary), field('درجة الشهرة (للصعوبة)', level)),
      h('div', { class: 'cols-2' }, field('الطبقة', tabaqa), field('الوفاة كما ترد في المصدر (للعرض)', deathText, 'سنة الوفاة المعتمدة للألعاب تُؤخذ من «المعلومات» الموثقة.')),
      field('النبذة', bio), h('div', { class: 'small muted' }, 'مصادر النبذة:'), bioC, h('div', { style: { height: '.6rem' } }), field('الحالة', status)),
    (close) => [h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
      const categories = [...cats.querySelectorAll('input:checked')].map((i) => i.value);
      let prim = primary.value || categories[0] || null;
      if (prim && !categories.includes(prim)) categories.unshift(prim);
      const body = { name: name.value.trim(), fullName: full.value.trim() || null, aliases: aliases.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean), categories, primaryCategory: prim, level: +level.value, tabaqa: +AR.toLatinDigits(tabaqa.value) || null, deathText: deathText.value.trim() || null, bio: bio.value.trim(), bioCitations: bioC.get(), status: status.value };
      try {
        const r = p.id ? await api('/api/admin/persons/' + p.id, { method: 'PUT', body }) : await api('/api/admin/persons', { body });
        invalidate('persons'); toast('حُفظ', 'ok'); close();
        if (onSaved) onSaved(r); else location.hash = '#/persons/' + r.id;
      } catch (e) { toast(e.message, 'err'); }
    } }, 'حفظ')]);
  }

  async function personDetail(id) {
    const [full, persons, sources] = await Promise.all([api('/api/admin/persons/' + id + '/full'), load('persons'), load('sources')]);
    const p = full.person;
    const pById = Object.fromEntries(persons.map((x) => [x.id, x]));
    const sById = Object.fromEntries(sources.map((x) => [x.id, x]));
    const catName = Object.fromEntries(C.categories.map((c) => [c.id, c.name]));
    const reload = () => personDetail(id).then(() => {});
    mainEl.innerHTML = '';
    title(p.name, demoBadge(p), statusBadge(p.status),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => personForm(p, () => { mainEl.innerHTML = ''; personDetail(id); }) }, 'تعديل'),
      p.status !== 'approved' ? h('button', { class: 'btn btn-sm btn-green', type: 'button', onclick: async () => { await api('/api/admin/persons/' + id, { method: 'PUT', body: { status: 'approved' } }); invalidate('persons'); mainEl.innerHTML = ''; personDetail(id); } }, 'اعتماد العلم') : null,
      h('button', { class: 'btn btn-sm btn-red', type: 'button', onclick: async () => { if (!confirm('حذف العلم وكل معلوماته؟ الأسئلة المرتبطة به ستعود للمراجعة.')) return; await api('/api/admin/persons/' + id, { method: 'DELETE' }); invalidate('persons', 'claims'); location.hash = '#/persons'; } }, 'حذف'),
      h('a', { class: 'btn btn-sm btn-ghost', href: '#/persons' }, 'رجوع'));
    mainEl.append(h('section', { class: 'panel', style: { marginBottom: '1rem' } }, h('dl', { class: 'kv' },
      h('dt', null, 'الصيغ البديلة'), h('dd', null, (p.aliases || []).join('، ') || '—'),
      h('dt', null, 'التصنيفات'), h('dd', null, (p.categories || []).map((c) => (catName[c] || c) + (c === p.primaryCategory ? ' (رئيسي)' : '')).join('، ') || '—'),
      h('dt', null, 'سنة الوفاة المعتمدة'), h('dd', null, full.deathYear ? num(full.deathYear) + 'هـ' : full.conflicts.length ? h('span', { class: 'badge badge-bad' }, 'متعارضة — راجع المعلومات') : 'لم تثبت بعد'),
      h('dt', null, 'العصر'), h('dd', null, full.deathYear ? AR.centuryName(AR.century(full.deathYear)) : '—'),
      h('dt', null, 'النبذة'), h('dd', null, p.bio || h('span', { class: 'muted' }, 'لم تُكتب بعد')),
      p.notes ? h('dt', null, 'ملاحظات') : null, p.notes ? h('dd', null, p.notes) : null)));
    if (full.conflicts.length) {
      mainEl.append(h('div', { class: 'item-card', style: { borderColor: 'var(--red-2)', marginBottom: '1rem' } }, h('b', null, '⚠ تعارض بين الروايات: '),
        full.conflicts.map((c) => C.CLAIM_KINDS[c.kind] + ': ' + c.claims.map((x) => claimSummary(x, pById)).join(' / ')).join(' · '),
        h('div', { class: 'small muted' }, 'اعرض الروايات بمصادرها، واعتمد ما يترجح لديك أو اترك الأمر «قيد المراجعة». الألعاب لا تستعمل معلومة متعارضة معتمدة.')));
    }
    const list = h('div', { class: 'card-list' });
    for (const c of full.claims.sort((a, b) => a.kind.localeCompare(b.kind))) {
      list.append(h('div', { class: 'item-card' },
        h('div', { class: 'hd' }, h('b', null, C.CLAIM_KINDS[c.kind]), statusBadge(c.status), demoBadge(c), h('span', { class: 'spacer' }),
          c.status !== 'approved' ? h('button', { class: 'btn btn-sm btn-green', type: 'button', onclick: async () => {
            if (!(c.citations || []).length && !c.demo && !confirm('لا توجد إحالة لهذه المعلومة. اعتمادها دون مصدر؟')) return;
            await api('/api/admin/claims/' + c.id, { method: 'PUT', body: { status: 'approved' } }); invalidate('claims'); reload();
          } }, 'اعتماد') : null,
          c.status !== 'rejected' ? h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { await api('/api/admin/claims/' + c.id, { method: 'PUT', body: { status: 'rejected' } }); invalidate('claims'); reload(); } }, 'رفض') : null,
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => claimEditor(c, id, reload) }, 'تعديل'),
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'حذف', onclick: async () => { if (confirm('حذف هذه المعلومة؟')) { await api('/api/admin/claims/' + c.id, { method: 'DELETE' }); invalidate('claims'); reload(); } } }, '🗑')),
        h('div', null, claimSummary(c, pById)), citeText(c, sById), c.note ? h('div', { class: 'small muted' }, c.note) : null));
    }
    if (!full.claims.length) list.append(h('div', { class: 'empty' }, 'لا توجد معلومات بعد.'));
    mainEl.append(h('div', { class: 'row', style: { margin: '1rem 0 .5rem' } }, h('h3', { style: { margin: 0 } }, 'المعلومات الموثقة'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => claimEditor(null, id, reload) }, '+ معلومة')), list);

    // البحث في المصادر المستوردة
    const hitsBox = h('div', { class: 'card-list' });
    mainEl.append(h('div', { class: 'row', style: { margin: '1.5rem 0 .5rem' } }, h('h3', { style: { margin: 0 } }, 'مواضع ورود الاسم في المصادر المستوردة'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
        hitsBox.innerHTML = '';
        const names = [p.name, ...(p.aliases || [])];
        const all = [];
        for (const n of names) for (const hit of await api('/api/admin/search-sources?name=' + encodeURIComponent(n))) if (!all.some((x) => x.documentId === hit.documentId && x.page === hit.page && x.vol === hit.vol)) all.push(hit);
        if (!all.length) hitsBox.append(h('div', { class: 'empty' }, 'لم يرد الاسم في النصوص المستوردة. استورد كتب التراجم من قسم الاستيراد.'));
        for (const hit of all) hitsBox.append(h('div', { class: 'item-card' }, h('div', { class: 'hd' }, h('b', null, hit.title), hit.vol ? h('span', null, 'ج' + num(hit.vol)) : null, hit.page ? h('span', null, 'ص' + num(hit.page)) : h('span', { class: 'muted small' }, 'بلا رقم صفحة'), hit.exact ? h('span', { class: 'badge badge-ok' }, 'تطابق تام') : h('span', { class: 'badge badge-warn' }, 'تطابق جزئي'),
          h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => claimEditor({ kind: 'other', value: {}, status: 'review', personId: id, citations: [{ sourceId: hit.sourceId, documentId: hit.documentId, vol: hit.vol, page: hit.page, excerpt: hit.snippet }] }, id, reload) }, 'استخرج معلومة بهذه الإحالة')),
          h('div', { class: 'small' }, hit.snippet)));
      } }, 'ابحث الآن')), hitsBox);

    if (full.students.length || full.events.length || full.questions.length) {
      mainEl.append(h('h3', { style: { marginTop: '1.5rem' } }, 'روابط'), h('div', { class: 'panel small' },
        full.students.length ? h('p', null, 'تلاميذه في القاعدة: ' + full.students.map((s) => (pById[s.personId] || {}).name).join('، ')) : null,
        full.events.length ? h('p', null, 'وقائع مرتبطة: ' + full.events.map((e) => e.title).join('، ')) : null,
        full.questions.length ? h('p', null, 'أسئلة مبنية على معلوماته: ' + num(full.questions.length) + ' (', h('a', { href: '#/questions' }, 'بنك الأسئلة'), ')') : null));
    }
  }

  /* ===== التصنيفات ===== */
  VIEWS.categories = async () => {
    const persons = await load('persons', true);
    const cats = await load('categories', true);
    title('التصنيفات والطبقات', h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => catForm() }, '+ تصنيف'));
    mainEl.append(h('p', { class: 'muted' }, 'يمكن أن ينتمي العلم إلى أكثر من تصنيف مع تحديد تصنيف رئيسي. أما التصنيف الزمني فيُحسب تلقائيًا من سنة الوفاة المعتمدة (القرن الهجري).'));
    const grid = h('div', { class: 'card-list' });
    for (const c of cats) {
      const n = persons.filter((p) => (p.categories || []).includes(c.id)).length;
      const np = persons.filter((p) => p.primaryCategory === c.id).length;
      grid.append(h('div', { class: 'item-card row' }, h('span', { style: { width: '14px', height: '14px', borderRadius: '50%', background: c.color || '#888', display: 'inline-block' } }), h('b', null, c.name),
        h('span', { class: 'muted small' }, num(n) + ' علمًا (رئيسي لـ ' + num(np) + ')'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => catForm(c) }, 'تعديل'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (n) return toast('لا يمكن حذف تصنيف مستعمل', 'err'); if (confirm('حذف التصنيف؟')) { await api('/api/admin/categories/' + c.id, { method: 'DELETE' }); route(); } } }, '🗑')));
    }
    mainEl.append(grid);
    // التوزيع الزمني
    const claims = await load('claims', true);
    const byC = {};
    for (const c of claims) if (c.kind === 'death' && c.status === 'approved') { const cc = AR.century(c.value.year); byC[cc] = (byC[cc] || 0) + 1; }
    mainEl.append(h('h3', { style: { marginTop: '1.5rem' } }, 'التوزيع على القرون الهجرية (بحسب الوفاة المعتمدة)'),
      h('div', { class: 'card-list' }, Object.keys(byC).sort((a, b) => a - b).map((k) => h('div', { class: 'row' }, h('span', { style: { width: '170px' } }, AR.centuryName(+k)),
        h('div', { class: 'progress', style: { flex: 1 } }, h('i', { style: { width: Math.min(100, byC[k] * 8) + '%' } })), h('span', null, num(byC[k]))))));
    function catForm(c) {
      c = c || {};
      const n = inp(c.name), col = inp(c.color || '#c9a24a', { type: 'color' });
      modal(c.id ? 'تعديل التصنيف' : 'تصنيف جديد', h('div', null, field('الاسم', n), field('اللون', col)), (close) => [h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
        try { if (c.id) await api('/api/admin/categories/' + c.id, { method: 'PUT', body: { name: n.value, color: col.value } }); else await api('/api/admin/categories', { body: { name: n.value, color: col.value } }); close(); invalidate('categories'); C = await api('/api/catalog'); route(); } catch (e) { toast(e.message, 'err'); }
      } }, 'حفظ')]);
    }
  };

  /* ===== الوقائع والأماكن ===== */
  VIEWS.events = async () => {
    const [events, places, persons, sources] = await Promise.all([load('events', true), load('places', true), load('persons'), load('sources')]);
    const plById = Object.fromEntries(places.map((p) => [p.id, p]));
    const pById = Object.fromEntries(persons.map((p) => [p.id, p]));
    title('الوقائع والأماكن', h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => eventForm() }, '+ واقعة'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => placeForm() }, '+ مكان'));
    const list = h('div', { class: 'card-list' });
    for (const e of events.slice().sort((a, b) => (a.year || 0) - (b.year || 0))) {
      list.append(h('div', { class: 'item-card' }, h('div', { class: 'hd' }, h('b', null, e.title), e.year ? h('span', null, num(e.year) + 'هـ') : null, e.yearAlt ? h('span', { class: 'badge badge-bad' }, 'وقيل ' + num(e.yearAlt)) : null, statusBadge(e.status), demoBadge(e), h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => eventForm(e) }, 'تعديل'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (confirm('حذف الواقعة؟')) { await api('/api/admin/events/' + e.id, { method: 'DELETE' }); route(); } } }, '🗑')),
        h('div', { class: 'small muted' }, (plById[e.placeId] || {}).name || 'مكان غير محدد', ' · ', (e.personIds || []).map((id) => (pById[id] || {}).name).join('، ') || 'بلا قادة مرتبطين'),
        e.outcome ? h('div', { class: 'small' }, 'ما حدث: ' + e.outcome) : null));
    }
    mainEl.append(list, h('h3', { style: { marginTop: '1.5rem' } }, 'الأماكن (للخريطة)'),
      h('div', { class: 'row' }, places.map((p) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => placeForm(p) }, p.name + (p.lat != null ? ' ⌖' : '')))));
    function eventForm(e) {
      e = e || { personIds: [], citations: [], status: 'review' };
      const t = inp(e.title), y = inp(e.year, { inputmode: 'numeric' }), ya = inp(e.yearAlt, { inputmode: 'numeric', placeholder: 'إن اختلفت المصادر' });
      const pl = sel([['', '—'], ...places.map((p) => [p.id, p.name])], e.placeId);
      const ps = h('select', { class: 'input', multiple: true, size: 6 }, persons.map((p) => h('option', { value: p.id, selected: (e.personIds || []).includes(p.id) }, p.name)));
      const ctx = area(e.context, { placeholder: 'سياق الواقعة (لسؤال: ماذا حدث؟)' }), out = area(e.outcome, { placeholder: 'ما الذي حدث فعلًا (من المصادر)' });
      const cites = citationsEditor(e.citations, sources);
      const st = sel(Object.entries(C.STATUS), e.status);
      modal(e.id ? 'تعديل واقعة' : 'واقعة جديدة', h('div', null, field('العنوان', t), h('div', { class: 'cols-2' }, field('السنة (هـ)', y), field('سنة في رواية أخرى', ya)), field('المكان', pl), field('القادة المرتبطون', ps, 'Ctrl/Cmd للاختيار المتعدد'), field('السياق', ctx), field('ما حدث', out), cites, field('الحالة', st)),
        (close) => [h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
          const body = { title: t.value, year: +AR.toLatinDigits(y.value) || null, yearAlt: +AR.toLatinDigits(ya.value) || null, placeId: pl.value || null, personIds: [...ps.selectedOptions].map((o) => o.value), context: ctx.value.trim() || null, outcome: out.value.trim() || null, citations: cites.get(), status: st.value };
          try { if (e.id) await api('/api/admin/events/' + e.id, { method: 'PUT', body }); else await api('/api/admin/events', { body }); close(); route(); } catch (er) { toast(er.message, 'err'); }
        } }, 'حفظ')]);
    }
    function placeForm(p) {
      p = p || {};
      const n = inp(p.name), la = inp(p.lat, { inputmode: 'decimal', placeholder: 'خط العرض' }), lo = inp(p.lon, { inputmode: 'decimal', placeholder: 'خط الطول' });
      modal(p.id ? 'تعديل مكان' : 'مكان جديد', h('div', null, field('الاسم', n), h('div', { class: 'cols-2' }, field('خط العرض', la), field('خط الطول', lo)), h('p', { class: 'small muted' }, 'تُستعمل الإحداثيات في لعبة خريطة الأحداث. أضفها فقط إذا كان الموقع ثابتًا.')),
        (close) => [h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
          const body = { name: n.value, lat: la.value === '' ? null : +la.value, lon: lo.value === '' ? null : +lo.value };
          try { if (p.id) await api('/api/admin/places/' + p.id, { method: 'PUT', body }); else await api('/api/admin/places', { body }); invalidate('places'); close(); route(); } catch (er) { toast(er.message, 'err'); }
        } }, 'حفظ')]);
    }
  };

  /* ===== المصطلحات ===== */
  VIEWS.terms = async () => {
    const [terms, sources] = await Promise.all([load('terms', true), load('sources')]);
    title('المصطلحات الفقهية', h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => form() }, '+ مصطلح'));
    mainEl.append(h('p', { class: 'muted' }, 'تحدي المصطلحات يعتمد على تعريف منقول من مصدر معتمد. إن اختلف تعريف المصطلح بين المذاهب فاذكر المذهب في الحقل المخصص، وأدخل كل تعريف مصطلحًا مستقلًا.'));
    const list = h('div', { class: 'card-list' });
    for (const t of terms) list.append(h('div', { class: 'item-card' }, h('div', { class: 'hd' }, h('b', null, t.term), t.madhhab ? h('span', { class: 'badge badge-info' }, t.madhhab) : null, statusBadge(t.status), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => form(t) }, 'تعديل'), h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (confirm('حذف؟')) { await api('/api/admin/terms/' + t.id, { method: 'DELETE' }); route(); } } }, '🗑')),
      h('div', null, t.definition)));
    if (!terms.length) list.append(h('div', { class: 'empty' }, h('b', null, 'لا توجد مصطلحات بعد'), 'أضف المصطلحات مع تعريفاتها الموثقة لتفعيل «تحدي المصطلحات».'));
    mainEl.append(list);
    function form(t) {
      t = t || { citations: [], status: 'review' };
      const term = inp(t.term), def = area(t.definition), md = inp(t.madhhab, { placeholder: 'اختياري' }), lv = sel([[1, 'سهل'], [2, 'متوسط'], [3, 'صعب']], t.level || 2);
      const cites = citationsEditor(t.citations, sources), st = sel(Object.entries(C.STATUS), t.status);
      modal(t.id ? 'تعديل مصطلح' : 'مصطلح جديد', h('div', null, field('المصطلح', term), field('التعريف كما في المصدر', def), h('div', { class: 'cols-2' }, field('المذهب', md), field('الصعوبة', lv)), cites, field('الحالة', st)),
        (close) => [h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
          const body = { term: term.value.trim(), definition: def.value.trim(), madhhab: md.value.trim() || null, level: +lv.value, citations: cites.get(), status: st.value };
          if (body.status === 'approved' && !body.citations.length) return toast('لا يُعتمد التعريف دون مصدر', 'err');
          try { if (t.id) await api('/api/admin/terms/' + t.id, { method: 'PUT', body }); else await api('/api/admin/terms', { body }); close(); route(); } catch (er) { toast(er.message, 'err'); }
        } }, 'حفظ')]);
    }
  };

  /* ===== المصادر والشاملة ===== */
  VIEWS.sources = async () => {
    const [sources, docs] = await Promise.all([load('sources', true), load('documents', true)]);
    title('المصادر', h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => srcForm() }, '+ مصدر'));
    mainEl.append(h('p', { class: 'muted small' }, 'روابط المصادر للتوثيق فقط؛ المنصة لا تتصل بأي موقع خارجي ولا تجلب منه محتوى. يُدخل المحتوى العلمي يدويًا أو بالاستيراد من الملفات.'));
    const list = h('div', { class: 'card-list' });
    for (const s of sources) {
      const n = docs.filter((d) => d.sourceId === s.id).length;
      list.append(h('div', { class: 'item-card' }, h('div', { class: 'hd' }, h('b', null, s.title), s.author ? h('span', { class: 'muted' }, '— ' + s.author + (s.authorDeath ? ' (ت ' + num(s.authorDeath) + 'هـ)' : '')) : null,
        s.edition ? h('span', { class: 'badge badge-info' }, 'ط. ' + s.edition) : null,
        s.url ? h('a', { class: 'badge badge-ok', href: s.url, target: '_blank', rel: 'noopener' }, 'رابط توثيق') : null,
        n ? h('span', { class: 'badge badge-info' }, num(n) + ' نص مستورد') : null, h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => srcForm(s) }, 'تعديل'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (confirm('حذف المصدر؟ الإحالات إليه ستبقى بلا عنوان.')) { await api('/api/admin/sources/' + s.id, { method: 'DELETE' }); route(); } } }, '🗑')),
        s.notes ? h('div', { class: 'small muted' }, s.notes) : null));
    }
    mainEl.append(h('h3', null, 'قائمة المصادر'), list);
    const dl = h('div', { class: 'card-list' });
    for (const d of docs) {
      dl.append(h('div', { class: 'item-card' }, h('div', { class: 'hd' }, h('b', null, d.title), h('span', { class: 'muted small' }, d.filename + ' · ' + num(d.pagesCount) + (d.hasPageNumbers ? ' صفحة مرقمة' : ' مقطعًا (بلا أرقام صفحات)')), h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => docViewer(d) }, 'تصفح وبحث'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (confirm('حذف النص المستورد؟')) { await api('/api/admin/documents/' + d.id, { method: 'DELETE' }); route(); } } }, '🗑')),
        (d.warnings || []).length ? h('div', { class: 'small', style: { color: '#e0b357' } }, d.warnings.join(' ')) : null));
    }
    if (!docs.length) dl.append(h('div', { class: 'empty' }, 'لا توجد نصوص مستوردة. ', h('a', { href: '#/import' }, 'استورد كتابًا من الشاملة')));
    mainEl.append(h('h3', { style: { marginTop: '1.5rem' } }, 'النصوص المستوردة (القاعدة المحلية)'), dl);

    function srcForm(s) {
      s = s || {};
      const t = inp(s.title), a = inp(s.author), ad = inp(s.authorDeath, { inputmode: 'numeric' }), u = inp(s.url, { style: { direction: 'ltr' } }), ed = inp(s.edition), n = area(s.notes);
      modal(s.id ? 'تعديل مصدر' : 'مصدر جديد', h('div', null, field('عنوان الكتاب', t), h('div', { class: 'cols-2' }, field('المؤلف', a), field('وفاة المؤلف (هـ)', ad)), field('رابط المصدر (للتوثيق فقط)', u), field('الطبعة / التحقيق', ed), field('ملاحظات', n)),
        (close) => [h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
          const body = { title: t.value.trim(), author: a.value.trim(), authorDeath: +AR.toLatinDigits(ad.value) || null, url: u.value.trim() || null, edition: ed.value.trim() || null, notes: n.value.trim() };
          try { if (s.id) await api('/api/admin/sources/' + s.id, { method: 'PUT', body }); else await api('/api/admin/sources', { body }); invalidate('sources'); close(); route(); } catch (er) { toast(er.message, 'err'); }
        } }, 'حفظ')]);
    }
  };

  async function docViewer(d) {
    const q = inp('', { type: 'search', placeholder: 'ابحث في نص الكتاب…' });
    const out = h('div', { class: 'card-list', style: { marginTop: '.8rem' } });
    const run = async () => {
      const r = await api('/api/admin/documents/' + d.id + '/pages?q=' + encodeURIComponent(q.value));
      out.innerHTML = '';
      out.append(h('div', { class: 'small muted' }, num(r.total) + ' نتيجة'));
      for (const pg of r.pages) out.append(h('div', { class: 'item-card' }, h('div', { class: 'small', style: { color: 'var(--gold-2)' } }, (pg.vol ? 'ج' + num(pg.vol) + ' ' : '') + (pg.page ? 'ص' + num(pg.page) : 'مقطع ' + num(pg.section || pg.i + 1))), h('div', { class: 'small', style: { whiteSpace: 'pre-wrap', maxHeight: '180px', overflow: 'auto' } }, pg.text)));
    };
    q.addEventListener('change', run);
    modal(d.title, h('div', { class: 'dark' }, h('div', { class: 'row' }, q, h('button', { class: 'btn btn-sm', type: 'button', onclick: run }, 'بحث')), out));
    run();
  }

  /* ===== الاستيراد ===== */
  VIEWS.import = async (arg) => {
    if (arg) return importReview(arg);
    const [imports, sources] = await Promise.all([load('imports', true), load('sources', true)]);
    title('الاستيراد');
    let kind = 'names';
    const kinds = h('div', { class: 'seg-ctl' },
      ...[['names', 'قائمة أسماء'], ['source', 'نص مصدر (كتاب من الشاملة)'], ['data', 'بيانات منظمة (JSON)']].map(([k, t]) => h('button', { type: 'button', class: k === kind ? 'on' : '', onclick: (e) => { kind = k; kinds.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); srcBox.classList.toggle('hidden', k !== 'source'); help.textContent = HELP[k]; } }, t)));
    const HELP = {
      names: 'ملف فيه أسماء الأعلام: سطر لكل اسم (TXT/DOCX/PDF)، أو جدول فيه عمود «الاسم» وقد يحوي «الوفاة» و«التصنيف» (CSV/XLSX/JSON). تُنظف الأسماء وتوحد ويُزال التكرار، ثم تُطابق بالأعلام الموجودة وبالنصوص المستوردة. لا يُضاف أي علم قبل قرارك.',
      source: 'نص كتاب مصدَّر من المكتبة الشاملة (TXT/DOCX/HTML/PDF). تُكتشف علامات الصفحات الشائعة مثل [ص: ١٢] و[ج ١ - ص ١٢]. يُحفظ النص في القاعدة المحلية للبحث فيه وربط المعلومات بمواضعها.',
      data: 'ملف JSON منظم: { "persons": [ { "name": "...", "categories": ["muhaddith"], "claims": [ { "kind": "death", "value": {"year": 256}, "citations": [ {"sourceId": "...", "vol": 1, "page": 2} ] } ] } ] }. يدخل كله «قيد المراجعة».',
    };
    const help = h('p', { class: 'muted small' }, HELP.names);
    const srcSel = sel([['', '— مصدر جديد —'], ...sources.map((s) => [s.id, s.title])], '');
    const sTitle = inp('', { placeholder: 'عنوان الكتاب' }), sAuthor = inp('', { placeholder: 'المؤلف' });
    const srcBox = h('div', { class: 'hidden dark', style: { marginTop: '.6rem' } }, field('ربط النص بمصدر', srcSel), h('div', { class: 'cols-2' }, sTitle, sAuthor));
    const file = h('input', { type: 'file', accept: '.csv,.tsv,.xlsx,.json,.txt,.pdf,.docx,.html,.htm', class: 'hidden', id: 'file' });
    const status = h('div', { class: 'small', style: { marginTop: '.6rem' } });
    const drop = h('label', { class: 'dropzone', for: 'file' }, h('b', null, 'اسحب الملف هنا أو اضغط للاختيار'), h('div', { class: 'small muted' }, 'PDF · CSV · Excel (xlsx) · JSON · TXT · Word (docx) · HTML — حتى ٤٠ ميغابايت'));
    const upload = async (f) => {
      if (!f) return;
      if (f.size > 40 * 1048576) return toast('الملف أكبر من ٤٠ ميغابايت', 'err');
      status.textContent = 'جارٍ قراءة «' + f.name + '»…';
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(f); });
      try {
        const body = { filename: f.name, contentBase64: b64, kind };
        if (kind === 'source') { body.sourceId = srcSel.value || null; body.title = sTitle.value || f.name.replace(/\.[^.]+$/, ''); body.author = sAuthor.value; }
        const r = await api('/api/admin/import', { body });
        invalidate('imports', 'documents', 'sources', 'persons', 'claims');
        if (r.kind === 'names') { toast('استُخرج ' + num(r.import.items.length) + ' اسمًا', 'ok'); location.hash = '#/import/' + r.import.id; }
        else if (r.kind === 'source') {
          status.innerHTML = '';
          status.append(h('div', { class: 'item-card' }, h('b', null, '✓ استُورد النص: ' + r.document.title), h('div', null, num(r.document.pagesCount) + (r.document.hasPageNumbers ? ' صفحة مرقمة' : ' مقطعًا — لم تُكتشف أرقام صفحات، فلن تُنسب أرقام صفحات تلقائيًا')),
            (r.warnings || []).map((w) => h('div', { style: { color: '#e0b357' } }, '⚠ ' + w)),
            h('div', { class: 'pre' }, r.preview.map((p) => (p.page ? '[ص ' + p.page + '] ' : '') + p.text.slice(0, 400)).join('\n—\n'))));
        } else { toast('أُدخل ' + num(r.persons) + ' علمًا و' + num(r.claims) + ' معلومة قيد المراجعة', 'ok'); status.textContent = ''; }
      } catch (e) { status.textContent = ''; toast(e.message, 'err'); }
    };
    file.addEventListener('change', () => upload(file.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); upload(e.dataTransfer.files[0]); });
    mainEl.append(h('section', { class: 'panel' }, kinds, help, srcBox, h('div', { style: { height: '.8rem' } }), drop, file, status));
    const list = h('div', { class: 'card-list' });
    for (const imp of imports.slice().reverse()) {
      const pend = imp.items.filter((i) => i.decision === 'pending').length;
      list.append(h('a', { class: 'item-card row', href: '#/import/' + imp.id, style: { textDecoration: 'none', color: 'inherit' } }, h('b', null, imp.filename), h('span', { class: 'muted small' }, (imp.createdAt || '').slice(0, 10) + ' · ' + num(imp.items.length) + ' اسمًا · أزيل ' + num(imp.duplicatesRemoved || 0) + ' مكررًا'),
        h('span', { class: 'spacer' }), pend ? h('span', { class: 'badge badge-warn' }, num(pend) + ' بانتظار القرار') : h('span', { class: 'badge badge-ok' }, 'رُوجعت')));
    }
    mainEl.append(h('h3', { style: { marginTop: '1.5rem' } }, 'قوائم الأسماء المستوردة'), list.children.length ? list : h('div', { class: 'empty' }, 'لا توجد قوائم بعد.'));
  };

  async function importReview(id) {
    const [imp, persons] = await Promise.all([api('/api/admin/imports/' + id), load('persons', true)]);
    const catName = Object.fromEntries(C.categories.map((c) => [c.id, c.name]));
    title('مراجعة: ' + imp.filename,
      h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { await api('/api/admin/imports/' + id + '/rematch', { body: {} }); route(); } }, 'إعادة المطابقة'),
      h('a', { class: 'btn btn-sm btn-ghost', href: '#/import' }, 'رجوع'));
    mainEl.append(h('p', { class: 'muted small' }, 'لكل اسم: «جديد» يضيفه علمًا قيد المراجعة، «دمج» يضيف الصيغة إلى علم موجود، «تجاهل» يستبعده. سنوات الوفاة الواردة في القائمة تُحفظ مسودة تحتاج توثيقًا، ولا تُعتمد تلقائيًا. لا يُضاف أي علم من خارج قائمتك.'),
      (imp.warnings || []).length ? h('div', { class: 'item-card small', style: { color: '#e0b357' } }, imp.warnings.join(' ')) : null);
    const decisions = new Map();
    const tbody = h('tbody');
    imp.items.forEach((it, i) => {
      const nameIn = inp(it.name, { 'aria-label': 'الاسم', disabled: it.applied });
      const mergeSel = sel([['', '— اختر علمًا للدمج —'], ...it.matches.map((m) => [m.personId, m.name + ' (' + Math.round(m.score * 100) + '٪)']), ['__all', '— كل الأعلام —']], it.personId, { disabled: it.applied });
      mergeSel.addEventListener('change', () => {
        if (mergeSel.value === '__all') {
          mergeSel.innerHTML = '';
          mergeSel.append(h('option', { value: '' }, '—'), ...persons.map((p) => h('option', { value: p.id }, p.name)));
        }
      });
      const catSel = sel([['', '— التصنيف —'], ...C.categories.map((c) => [c.id, c.name])], (it.categories || [])[0] || it.categoryHint || '', { disabled: it.applied });
      const hits = (it.sourceHits || []).map((hh, k) => h('label', { class: 'row small', style: { gap: '.3rem', alignItems: 'flex-start' } }, h('input', { type: 'checkbox', 'data-k': k, disabled: it.applied }), h('span', null, hh.title + (hh.vol ? ' ج' + num(hh.vol) : '') + (hh.page ? ' ص' + num(hh.page) : '') + ': ' + hh.snippet.slice(0, 120))));
      const decBtns = h('div', { class: 'seg-ctl' }, ...[['new', 'جديد'], ['merge', 'دمج'], ['skip', 'تجاهل']].map(([d, t]) => h('button', { type: 'button', class: it.decision === d ? 'on' : '', disabled: it.applied, onclick: (e) => { decBtns.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); decisions.set(i, d); } }, t)));
      const get = () => ({
        index: i, decision: decisions.get(i) || it.decision, name: nameIn.value, personId: mergeSel.value && mergeSel.value !== '__all' ? mergeSel.value : null,
        categories: catSel.value ? [catSel.value] : null, acceptedHits: [...tbody.querySelectorAll('tr[data-i="' + i + '"] input[type=checkbox]:checked')].map((c) => it.sourceHits[+c.dataset.k]),
      });
      const tr = h('tr', { 'data-i': i },
        h('td', null, nameIn, it.raw !== it.name ? h('div', { class: 'small muted' }, 'الأصل: ' + it.raw) : null, it.duplicates ? h('div', { class: 'small muted' }, 'تكرر ' + num(it.duplicates + 1) + ' مرات') : null, it.note ? h('div', { class: 'small muted' }, it.note) : null),
        h('td', null, it.deathHint ? num(it.deathHint) + 'هـ' : '—', it.deathHint ? h('div', { class: 'small muted' }, 'من القائمة') : null),
        h('td', null, catSel, it.categoryHint && catName[it.categoryHint] ? h('div', { class: 'small muted' }, 'تلميح: ' + catName[it.categoryHint]) : null),
        h('td', null, mergeSel, it.matches.length ? null : h('div', { class: 'small muted' }, 'لا تطابق')),
        h('td', { style: { maxWidth: '320px' } }, hits.length ? hits : h('span', { class: 'small muted' }, 'لم يرد في النصوص المستوردة')),
        h('td', null, it.applied ? h('span', { class: 'badge badge-ok' }, 'طُبق') : decBtns));
      tr.get = get;
      tbody.append(tr);
    });
    const save = async (apply) => {
      const ds = [...tbody.children].filter((tr) => tr.get).map((tr) => tr.get()).filter((d) => !imp.items[d.index].applied);
      for (const d of ds) if (d.decision === 'merge' && !d.personId) return toast('حدد العلم المراد الدمج معه للاسم: ' + d.name, 'err');
      try {
        await api('/api/admin/imports/' + id + '/decide', { body: { decisions: ds } });
        if (apply) { const r = await api('/api/admin/imports/' + id + '/apply', { body: {} }); toast('أُضيف ' + num(r.created) + ' علمًا، ودُمج ' + num(r.merged) + '، وتُجوهل ' + num(r.skipped), 'ok'); invalidate('persons', 'claims'); }
        else toast('حُفظت القرارات', 'ok');
        route();
      } catch (e) { toast(e.message, 'err'); }
    };
    mainEl.append(h('div', { class: 'toolbar' },
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { [...tbody.children].forEach((tr, i) => { if (!imp.items[i].applied && (decisions.get(i) || imp.items[i].decision) === 'pending') { decisions.set(i, 'new'); tr.querySelectorAll('.seg-ctl button')[0].classList.add('on'); } }); } }, 'اجعل كل المعلقة «جديد»'),
      h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => save(false) }, 'حفظ القرارات'), h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => save(true) }, 'حفظ وتطبيق')),
      h('div', { class: 'tbl-wrap dark' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['الاسم', 'الوفاة', 'التصنيف', 'مطابقة بعلم موجود', 'مواضع في المصادر', 'القرار'].map((t) => h('th', null, t)))), tbody)));
  }

  /* ===== المراجعة والتعارضات ===== */
  VIEWS.review = async () => {
    const [claims, persons, sources, conflicts] = await Promise.all([load('claims', true), load('persons', true), load('sources'), api('/api/admin/conflicts')]);
    const pById = Object.fromEntries(persons.map((p) => [p.id, p]));
    const sById = Object.fromEntries(sources.map((s) => [s.id, s]));
    title('المراجعة والتعارضات');
    const setStatus = async (ids, status) => { await api('/api/admin/bulk', { body: { collection: 'claims', ids, patch: { status } } }); invalidate('claims'); route(); };
    // التعارضات
    const cl = h('div', { class: 'card-list' });
    for (const c of conflicts) {
      cl.append(h('div', { class: 'item-card', style: { borderColor: 'var(--red-2)' } }, h('div', { class: 'hd' }, h('b', null, c.personName), h('span', { class: 'badge badge-bad' }, c.kind === 'event-year' ? 'تاريخ واقعة' : C.CLAIM_KINDS[c.kind]), c.personId ? h('a', { class: 'btn btn-sm', href: '#/persons/' + c.personId }, 'فتح العلم') : null),
        c.note ? h('div', null, c.note) : null,
        c.claims.map((x) => h('div', { class: 'row small', style: { padding: '.3rem 0', borderTop: '1px solid var(--line)' } }, h('b', null, claimSummary(x, pById)), statusBadge(x.status), citeText(x, sById), h('span', { class: 'spacer' }),
          h('button', { class: 'btn btn-sm btn-green', type: 'button', onclick: () => setStatus([x.id], 'approved') }, 'ترجيح واعتماد'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => setStatus([x.id], 'rejected') }, 'رفض'))),
        h('div', { class: 'small muted' }, 'إن تعذر الترجيح فاترك الروايتين قيد المراجعة؛ لن تدخل هذه المعلومة في الأسئلة.')));
    }
    mainEl.append(h('h3', null, 'التعارضات بين المصادر (' + num(conflicts.length) + ')'), conflicts.length ? cl : h('div', { class: 'empty' }, 'لا توجد تعارضات.'));
    // معلومات بانتظار المراجعة
    const pending = claims.filter((c) => c.status === 'draft' || c.status === 'review');
    const tbody = h('tbody');
    for (const c of pending) {
      tbody.append(h('tr', null, h('td', null, h('input', { type: 'checkbox', value: c.id, 'aria-label': 'تحديد' })), h('td', null, h('a', { href: '#/persons/' + c.personId }, (pById[c.personId] || {}).name || '؟')),
        h('td', null, C.CLAIM_KINDS[c.kind]), h('td', null, claimSummary(c, pById), c.note ? h('div', { class: 'small muted' }, c.note) : null), h('td', null, citeText(c, sById)), h('td', null, statusBadge(c.status), demoBadge(c)),
        h('td', { class: 'actions' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => claimEditor(c, c.personId, () => route()) }, 'تعديل'))));
    }
    const ids = () => [...tbody.querySelectorAll('input:checked')].map((i) => i.value);
    mainEl.append(h('div', { class: 'row', style: { margin: '1.5rem 0 .5rem' } }, h('h3', { style: { margin: 0 } }, 'معلومات بانتظار المراجعة (' + num(pending.length) + ')'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm btn-green', type: 'button', onclick: () => { const s = ids(); if (!s.length) return toast('حدد معلومات أولًا'); const unsourced = pending.filter((c) => s.includes(c.id) && !(c.citations || []).length && !c.demo).length; if (unsourced && !confirm(num(unsourced) + ' منها بلا مصدر. اعتمادها؟')) return; setStatus(s, 'approved'); } }, 'اعتماد المحدد'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { const s = ids(); if (s.length) setStatus(s, 'rejected'); } }, 'رفض المحدد')),
    pending.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['', 'العلم', 'النوع', 'المعلومة', 'المصدر', 'الحالة', ''].map((t) => h('th', null, t)))), tbody)) : h('div', { class: 'empty' }, 'لا توجد معلومات معلقة.'));
    const uns = claims.filter((c) => c.status === 'approved' && !c.demo && !(c.citations || []).length);
    if (uns.length) mainEl.append(h('h3', { style: { marginTop: '1.5rem' } }, 'معلومات معتمدة بلا مصدر (' + num(uns.length) + ')'), h('div', { class: 'card-list' }, uns.map((c) => h('div', { class: 'item-card row' }, h('b', null, (pById[c.personId] || {}).name), claimSummary(c, pById), h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => claimEditor(c, c.personId, () => route()) }, 'توثيق')))));
  };

  /* ===== بنك الأسئلة ===== */
  VIEWS.questions = async () => {
    const qs = await load('questions', true);
    title('بنك الأسئلة', h('button', { class: 'btn btn-sm', type: 'button', onclick: () => qForm() }, '+ سؤال يدوي'), h('a', { class: 'btn btn-sm', href: '/api/admin/export/questions.csv' }, 'تصدير CSV'));
    // التوليد
    const modeChecks = h('div', { class: 'row small' }, Object.entries(C.MODES).map(([k, m]) => h('label', { class: 'row', style: { gap: '.25rem' } }, h('input', { type: 'checkbox', value: k, checked: true }), m.title)));
    const lim = inp(10, { type: 'number', min: 1, max: 50, style: { width: '90px' }, 'aria-label': 'الحد لكل نمط' });
    mainEl.append(h('details', { class: 'panel', style: { marginBottom: '1rem' } }, h('summary', { style: { cursor: 'pointer', fontFamily: 'var(--f-head)', color: 'var(--gold-2)' } }, 'توليد مسودات أسئلة من المعلومات المعتمدة'),
      h('p', { class: 'small muted' }, 'يولّد النظام أسئلة من المعلومات المعتمدة فقط، وتُحفظ «مسودة» لا تظهر في المسابقات حتى تعتمدها. لا يُكرر سؤالًا سبق توليده أو رفضه.'),
      modeChecks, h('div', { class: 'row dark', style: { marginTop: '.6rem' } }, h('span', { class: 'small' }, 'الحد لكل نمط:'), lim,
        h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: async () => {
          const modes = [...modeChecks.querySelectorAll('input:checked')].map((i) => i.value);
          try { const r = await api('/api/admin/generate', { body: { modes, limitPerMode: +lim.value } }); toast('وُلدت ' + num(r.created) + ' مسودة', 'ok'); route(); } catch (e) { toast(e.message, 'err'); }
        } }, 'ولّد المسودات'))));
    const q = inp('', { class: 'input search', type: 'search', placeholder: 'بحث في نص السؤال…' });
    const fs = sel([['', 'كل الحالات'], ...Object.entries(C.STATUS)], 'draft');
    const fm = sel([['', 'كل الأنماط'], ...Object.entries(C.MODES).map(([k, m]) => [k, m.title])], '');
    const fc = sel([['', 'كل التصنيفات'], ...C.categories.map((c) => [c.id, c.name])], '');
    const fdf = sel([['', 'كل الصعوبات'], ['1', 'سهل'], ['2', 'متوسط'], ['3', 'صعب']], '');
    const fd = sel([['', 'الكل'], ['real', 'الحقيقي'], ['demo', 'التجريبي']], '');
    const list = h('div', { class: 'card-list' });
    const counter = h('span', { class: 'small muted' });
    const bulk = async (patch, del) => {
      const ids = [...list.querySelectorAll('input.qsel:checked')].map((i) => i.value);
      if (!ids.length) return toast('حدد أسئلة أولًا');
      if (del && !confirm('حذف ' + num(ids.length) + ' سؤالًا؟')) return;
      await api('/api/admin/bulk', { body: { collection: 'questions', ids, patch, delete: !!del } }); invalidate('questions'); route();
    };
    mainEl.append(h('div', { class: 'toolbar dark' }, q, fs, fm, fc, fdf, fd),
      h('div', { class: 'toolbar' }, h('label', { class: 'row small' }, h('input', { type: 'checkbox', onchange: (e) => list.querySelectorAll('input.qsel').forEach((c) => (c.checked = e.target.checked)) }), 'تحديد الظاهر'), counter, h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-sm btn-green', type: 'button', onclick: () => bulk({ status: 'approved' }) }, 'اعتماد المحدد'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => bulk({ status: 'rejected' }) }, 'رفض'),
        sel([['', 'تغيير الصعوبة…'], ['1', 'سهل'], ['2', 'متوسط'], ['3', 'صعب']], '', { class: 'input', style: { width: 'auto' }, onchange: (e) => e.target.value && bulk({ difficulty: +e.target.value }) }),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => bulk(null, true) }, 'حذف')), list);
    const paint = () => {
      const k = AR.normalize(q.value);
      const fl = qs.filter((x) => (!fs.value || x.status === fs.value) && (!fm.value || x.mode === fm.value) && (!fc.value || (x.categories || []).includes(fc.value)) &&
        (!fdf.value || String(x.difficulty) === fdf.value) && (!fd.value || (fd.value === 'demo' ? x.demo : !x.demo)) && (!k || AR.normalize(x.prompt).includes(k)));
      counter.textContent = num(fl.length) + ' سؤالًا';
      list.innerHTML = '';
      for (const x of fl.slice(0, 200)) {
        list.append(h('div', { class: 'item-card' }, h('div', { class: 'hd' }, h('input', { type: 'checkbox', class: 'qsel', value: x.id, 'aria-label': 'تحديد السؤال' }), h('span', { class: 'badge badge-info' }, (C.MODES[x.mode] || {}).title || x.mode),
          h('span', { class: 'small muted' }, C.DIFFICULTY[x.difficulty] ? C.DIFFICULTY[x.difficulty].name : ''), statusBadge(x.status), demoBadge(x), x.origin === 'manual' ? h('span', { class: 'badge badge-info' }, 'يدوي') : null,
          x.usedCount ? h('span', { class: 'small muted' }, 'استُخدم ' + num(x.usedCount)) : null, h('span', { class: 'spacer' }),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => preview(x) }, 'معاينة'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => qForm(x) }, 'تعديل'),
          x.status !== 'approved' ? h('button', { class: 'btn btn-sm btn-green', type: 'button', onclick: async () => { await api('/api/admin/questions/' + x.id, { method: 'PUT', body: { status: 'approved' } }); x.status = 'approved'; paint(); } }, 'اعتماد') : null),
          h('div', null, x.prompt), h('div', { class: 'small muted' }, 'الإجابة: ' + Engine.answerText(x)), x.reviewNote ? h('div', { class: 'small', style: { color: '#e0b357' } }, x.reviewNote) : null));
      }
      if (!fl.length) list.append(h('div', { class: 'empty' }, 'لا توجد أسئلة بهذه المرشحات.'));
    };
    [q, fs, fm, fc, fdf, fd].forEach((e) => e.addEventListener('input', paint));
    paint();
  };

  function preview(x) {
    const box = h('div', { class: 'paper' });
    const q = Engine.prepare(x);
    const v = window.HimmaQ.render(q, { onAnswer: (a) => { const g = Engine.grade(q, a); v.showResult(g, q); box.append(h('div', { class: 'feedback ' + (g.correct ? 'ok' : g.fraction > 0 ? 'part' : 'no') }, h('h3', null, g.correct ? 'صحيح' : 'الدرجة ' + num(Math.round(g.fraction * 100)) + '٪'), x.explanation || '')); } });
    box.append(v.el);
    modal('معاينة السؤال', box);
  }

  const TEMPLATES = {
    choice: { options: ['الإجابة الصحيحة', 'خيار ٢', 'خيار ٣', 'خيار ٤'], answer: 0 },
    reveal: { clues: ['تلميح صعب', 'تلميح متوسط', 'تلميح سهل'], options: ['الصحيح', 'ب', 'ج', 'د'], answer: 0 },
    card: { segments: [{ label: 'العصر', value: '' }, { label: 'البلد', value: '' }, { label: 'من مؤلفاته', value: '' }], options: ['الصحيح', 'ب', 'ج', 'د'], answer: 0 },
    order: { items: [{ label: 'أ', value: 100, shown: '١٠٠هـ' }, { label: 'ب', value: 200, shown: '٢٠٠هـ' }, { label: 'ج', value: 300, shown: '٣٠٠هـ' }] },
    match: { left: ['عالم ١', 'عالم ٢', 'عالم ٣'], right: ['كتابه ١', 'كتابه ٢', 'كتابه ٣'] },
    bucket: { buckets: ['القرن الثاني', 'القرن الثالث'], items: [{ label: 'أ', bucket: 0 }, { label: 'ب', bucket: 1 }] },
    spot: { statements: ['العبارة الخاطئة', 'عبارة صحيحة', 'عبارة صحيحة'], wrong: 0, correction: 'الصواب…' },
  };
  const TYPE_FOR_MODE = (m) => (C.MODES[m] || {}).type || 'choice';

  function qForm(x) {
    const isNew = !x;
    x = x || { mode: 'work-author', type: 'choice', difficulty: 2, prompt: '', data: TEMPLATES.choice, categories: [], status: 'draft', explanation: '' };
    const mode = sel(Object.entries(C.MODES).map(([k, m]) => [k, m.title]), x.mode);
    const prompt = area(x.prompt), expl = area(x.explanation, { placeholder: 'شرح علمي مختصر يظهر بعد الإجابة' });
    const diff = sel([[1, 'سهل'], [2, 'متوسط'], [3, 'صعب']], x.difficulty);
    const cats = h('div', { class: 'row small' }, C.categories.map((c) => h('label', { class: 'row', style: { gap: '.25rem' } }, h('input', { type: 'checkbox', value: c.id, checked: (x.categories || []).includes(c.id) }), c.name)));
    const data = area(JSON.stringify(x.data, null, 2), { style: { direction: 'ltr', fontFamily: 'monospace', minHeight: '200px' }, spellcheck: 'false' });
    const st = sel(Object.entries(C.STATUS), x.status);
    if (isNew) mode.addEventListener('change', () => { data.value = JSON.stringify(TEMPLATES[TYPE_FOR_MODE(mode.value)], null, 2); });
    modal(isNew ? 'سؤال يدوي' : 'تعديل السؤال', h('div', null, h('div', { class: 'cols-2' }, field('النمط', mode), field('الصعوبة', diff)), field('نص السؤال', prompt), field('بيانات السؤال (الخيارات والإجابة)', data, 'في الاختيار: answer رقم الخيار الصحيح بدءًا من 0. في الترتيب: value هي السنة. في الربط: left[i] يقابل right[i]. في السلال: bucket رقم السلة.'),
      field('الشرح', expl), field('التصنيفات', cats), field('الحالة', st)),
    (close) => [h('button', { class: 'btn', type: 'button', onclick: () => { try { preview({ ...x, mode: mode.value, type: TYPE_FOR_MODE(mode.value), style: C.MODES[mode.value].style || null, prompt: prompt.value, data: JSON.parse(data.value), difficulty: +diff.value }); } catch (e) { toast('بيانات JSON غير صالحة: ' + e.message, 'err'); } } }, 'معاينة'),
      h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
        let d;
        try { d = JSON.parse(data.value); } catch (e) { return toast('بيانات JSON غير صالحة: ' + e.message, 'err'); }
        const body = { mode: mode.value, type: TYPE_FOR_MODE(mode.value), style: C.MODES[mode.value].style || null, prompt: prompt.value.trim(), explanation: expl.value.trim(), difficulty: +diff.value, data: d, categories: [...cats.querySelectorAll('input:checked')].map((i) => i.value), status: st.value };
        try { if (isNew) await api('/api/admin/questions', { body }); else await api('/api/admin/questions/' + x.id, { method: 'PUT', body }); invalidate('questions'); close(); route(); } catch (e) { toast(e.message, 'err'); }
      } }, 'حفظ')]);
  }

  /* ===== تخصيص المسابقات ===== */
  VIEWS.competitions = async () => {
    const comps = await load('competitions', true);
    title('تخصيص المسابقات', h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => form() }, '+ مسابقة'));
    mainEl.append(h('p', { class: 'muted' }, 'صمّم خطة جولات تُختار عند إنشاء جلسة جماعية. «تحدي الهمّة الكبرى» متاح افتراضيًا دائمًا.'));
    const list = h('div', { class: 'card-list' });
    for (const c of comps) list.append(h('div', { class: 'item-card' }, h('div', { class: 'hd' }, h('b', null, c.name), h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => form(c) }, 'تعديل'),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (confirm('حذف؟')) { await api('/api/admin/competitions/' + c.id, { method: 'DELETE' }); route(); } } }, '🗑')),
      h('div', { class: 'small muted' }, (c.rounds || []).map((r) => (C.ROUND_TYPES[r.type] || {}).title + ' ×' + num(r.count)).join(' ← '))));
    mainEl.append(list.children.length ? list : h('div', { class: 'empty' }, 'لا توجد مسابقات مخصصة.'));
    function form(c) {
      c = c || { name: '', rounds: C.GRAND_PLAN.map((r) => ({ ...r })) };
      const name = inp(c.name);
      const rows = h('div', { style: { display: 'grid', gap: '.4rem' } });
      const add = (r) => {
        r = r || { type: 'standard', count: 3 };
        const t = sel(Object.entries(C.ROUND_TYPES).map(([k, v]) => [k, v.title]), r.type), n = inp(r.count, { type: 'number', min: 1, max: 30, style: { width: '80px' } });
        const tm = inp(r.timer || '', { type: 'number', min: 5, max: 300, placeholder: 'ثوانٍ', style: { width: '90px' } });
        const cat = sel([['', 'كل الفروع'], ...C.categories.map((x) => [x.id, x.name])], (r.categories || [])[0] || '');
        const df = sel([['1,2,3', 'كل المستويات'], ['1', 'سهل'], ['1,2', 'سهل ومتوسط'], ['2', 'متوسط'], ['2,3', 'متوسط وصعب'], ['3', 'صعب']], (r.difficulty || [1, 2, 3]).join(','));
        const row = h('div', { class: 'row' }, t, n, tm, cat, df, h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => row.remove() }, '✕'));
        row.get = () => ({ type: t.value, count: +n.value, timer: tm.value ? +tm.value : undefined, categories: cat.value ? [cat.value] : null, difficulty: df.value.split(',').map(Number) });
        rows.append(row);
      };
      (c.rounds || []).forEach(add);
      modal(c.id ? 'تعديل مسابقة' : 'مسابقة جديدة', h('div', null, field('اسم المسابقة', name), h('div', { class: 'small muted' }, 'الجولات (النوع · العدد · المؤقت · الفرع · الصعوبة):'), rows, h('button', { class: 'btn btn-sm', type: 'button', style: { marginTop: '.5rem' }, onclick: () => add() }, '+ جولة')),
        (close) => [h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
          const body = { name: name.value.trim(), rounds: [...rows.children].map((r) => r.get()) };
          try { if (c.id) await api('/api/admin/competitions/' + c.id, { method: 'PUT', body }); else await api('/api/admin/competitions', { body }); close(); route(); } catch (e) { toast(e.message, 'err'); }
        } }, 'حفظ')]);
    }
  };

  /* ===== الفرق ===== */
  VIEWS.teams = async () => {
    const teams = await load('teams', true);
    title('الفرق والمشاركون', h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: () => form() }, '+ فريق'));
    mainEl.append(h('p', { class: 'muted' }, 'سجّل فرق مجموعتك وأعضاءها للرجوع إليها. عند إنشاء جلسة تكتب أسماء الفرق، ويدخل المشاركون بأسمائهم من الهواتف.'));
    const list = h('div', { class: 'card-list' });
    for (const t of teams) list.append(h('div', { class: 'item-card' }, h('div', { class: 'hd' }, h('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: t.color || '#c9a24a', display: 'inline-block' } }), h('b', null, t.name), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => form(t) }, 'تعديل'), h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (confirm('حذف؟')) { await api('/api/admin/teams/' + t.id, { method: 'DELETE' }); route(); } } }, '🗑')),
      h('div', { class: 'small muted' }, (t.members || []).join('، ') || 'بلا أعضاء مسجلين')));
    mainEl.append(list.children.length ? list : h('div', { class: 'empty' }, 'لا توجد فرق مسجلة.'));
    function form(t) {
      t = t || {};
      const n = inp(t.name), col = inp(t.color || '#c9a24a', { type: 'color' }), m = area((t.members || []).join('\n'), { placeholder: 'عضو في كل سطر' });
      modal(t.id ? 'تعديل فريق' : 'فريق جديد', h('div', null, field('الاسم', n), field('اللون', col), field('الأعضاء', m)), (close) => [h('button', { class: 'btn btn-gold', type: 'button', onclick: async () => {
        const body = { name: n.value.trim(), color: col.value, members: m.value.split('\n').map((s) => s.trim()).filter(Boolean) };
        try { if (t.id) await api('/api/admin/teams/' + t.id, { method: 'PUT', body }); else await api('/api/admin/teams', { body }); close(); route(); } catch (e) { toast(e.message, 'err'); }
      } }, 'حفظ')]);
    }
  };

  /* ===== الجلسات والنتائج ===== */
  VIEWS.results = async () => {
    const [sessions, results] = await Promise.all([api('/api/sessions'), load('results', true)]);
    title('الجلسات والنتائج', h('a', { class: 'btn btn-gold btn-sm', href: '/host' }, 'جلسة جديدة'), h('a', { class: 'btn btn-sm', href: '/api/admin/export/results.csv' }, 'تصدير النتائج CSV'), h('a', { class: 'btn btn-sm', href: '/api/admin/export/claims.csv' }, 'تقرير المعلومات CSV'));
    const sl = h('div', { class: 'card-list' });
    for (const s of sessions) sl.append(h('div', { class: 'item-card row' }, h('b', null, s.name), h('span', { class: 'badge badge-info' }, 'رمز ' + s.code), h('span', { class: 'badge ' + (s.status === 'finished' ? 'badge-ok' : 'badge-warn') }, s.status === 'finished' ? 'منتهية' : s.status === 'paused' ? 'متوقفة' : s.status === 'lobby' ? 'لم تبدأ' : 'جارية'),
      h('span', { class: 'small muted' }, (s.createdAt || '').slice(0, 16).replace('T', ' ') + ' · ' + s.teams.map((t) => t.name + ' ' + num(t.score)).join(' · ')), h('span', { class: 'spacer' }),
      h('a', { class: 'btn btn-sm', href: '/host?id=' + s.id }, s.status === 'finished' ? 'عرض' : 'استكمال'),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (confirm('حذف الجلسة؟ (تبقى نتيجتها في السجل إن انتهت)')) { await api('/api/sessions/' + s.id, { method: 'DELETE' }); route(); } } }, '🗑')));
    mainEl.append(h('h3', null, 'الجلسات'), sl.children.length ? sl : h('div', { class: 'empty' }, 'لا توجد جلسات.'));
    const tb = h('tbody');
    for (const r of results.slice().reverse()) tb.append(h('tr', null, h('td', null, r.name), h('td', null, (r.date || '').slice(0, 16).replace('T', ' ')), h('td', null, r.teams.map((t, i) => num(i + 1) + '. ' + t.name + ' (' + num(t.score) + ')').join('، ')), h('td', null, r.winners.join(' و')), h('td', null, num(r.questions))));
    mainEl.append(h('h3', { style: { marginTop: '1.5rem' } }, 'سجل النتائج'), results.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['المسابقة', 'التاريخ', 'الترتيب', 'الفائز', 'الأسئلة'].map((t) => h('th', null, t)))), tb)) : h('div', { class: 'empty' }, 'لا توجد نتائج بعد.'));
  };

  /* ===== النسخ الاحتياطي ===== */
  VIEWS.backup = async () => {
    const backups = await api('/api/admin/backups');
    title('النسخ الاحتياطي والاستعادة');
    const file = h('input', { type: 'file', accept: '.json', class: 'input' });
    mainEl.append(h('div', { class: 'cols-2' },
      h('section', { class: 'panel' }, h('h3', null, 'تنزيل نسخة كاملة'), h('p', { class: 'small muted' }, 'ملف JSON واحد يشمل الأعلام والمعلومات والمصادر والنصوص المستوردة والأسئلة والنتائج.'),
        h('a', { class: 'btn btn-gold', href: '/api/admin/backup' }, 'تنزيل النسخة'),
        h('button', { class: 'btn', type: 'button', style: { marginInlineStart: '.5rem' }, onclick: async () => { const r = await api('/api/admin/backups', { body: {} }); toast('حُفظت نسخة على الخادم: ' + r.name, 'ok'); route(); } }, 'نسخة على الخادم')),
      h('section', { class: 'panel' }, h('h3', null, 'استعادة من ملف'), h('p', { class: 'small muted' }, 'تُحفظ نسخة من الحالة الحالية تلقائيًا قبل الاستعادة.'), file,
        h('button', { class: 'btn btn-red', type: 'button', style: { marginTop: '.6rem' }, onclick: async () => {
          const f = file.files[0]; if (!f) return toast('اختر ملفًا', 'err');
          if (!confirm('استبدال كل بيانات المنصة بمحتوى هذا الملف؟')) return;
          try { const snapshot = JSON.parse(await f.text()); const r = await api('/api/admin/restore', { body: { snapshot } }); toast('تمت الاستعادة. نسخة الأمان: ' + r.safety, 'ok'); Object.keys(cache).forEach((k) => delete cache[k]); route(); } catch (e) { toast(e.message, 'err'); }
        } }, 'استعادة'))),
    h('h3', { style: { marginTop: '1.5rem' } }, 'النسخ المحفوظة على الخادم'),
    h('div', { class: 'card-list' }, backups.map((b) => h('div', { class: 'item-card row' }, h('span', { style: { direction: 'ltr' } }, b.name), h('span', { class: 'muted small' }, Math.round(b.size / 1024) + ' KB'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { if (!confirm('استعادة هذه النسخة؟')) return; try { await api('/api/admin/backups/' + encodeURIComponent(b.name) + '/restore', { body: {} }); toast('تمت الاستعادة', 'ok'); Object.keys(cache).forEach((k) => delete cache[k]); route(); } catch (e) { toast(e.message, 'err'); } } }, 'استعادة')))),
    !backups.length ? h('div', { class: 'empty' }, 'لا توجد نسخ محفوظة على الخادم بعد.') : null);
  };

  /* ===== الإعدادات ===== */
  VIEWS.settings = async () => {
    const o = overview;
    title('الإعدادات');
    const cur = inp('', { type: 'password', autocomplete: 'current-password' }), nw = inp('', { type: 'password', autocomplete: 'new-password' });
    mainEl.append(h('div', { class: 'cols-2' },
      h('section', { class: 'panel dark' }, h('h3', null, 'تغيير كلمة المرور'), field('الحالية', cur), field('الجديدة (٨ أحرف على الأقل)', nw),
        h('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: async () => { try { await api('/api/auth/password', { body: { current: cur.value, next: nw.value } }); toast('تغيرت كلمة المرور', 'ok'); cur.value = nw.value = ''; } catch (e) { toast(e.message, 'err'); } } }, 'حفظ'))),
    h('section', { class: 'panel', style: { marginTop: '1rem' } }, h('h3', null, 'عن المنصة'),
      h('p', { class: 'small' }, 'تعمل المنصة على خادم محلي (Node.js) وتحفظ بياناتها في مجلد data. للتشغيل دون إنترنت: شغّل الخادم على جهاز، واربط الهواتف بشبكة الجهاز نفسها.'),
      h('p', { class: 'small muted' }, 'لإضافة فرع أو لعبة جديدة: أضف تعريفها في shared/catalog.js، ومولّد أسئلتها في server/generator.js إن احتاجت نمطًا جديدًا.')));
  };

  boot().catch((e) => { app.append(h('div', { class: 'wrap empty' }, h('b', null, 'خطأ'), e.message)); });
})();
