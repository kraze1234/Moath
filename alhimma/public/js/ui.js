/* أدوات الواجهة المشتركة: الطلبات، العناصر، الشعارات، الأصوات، الإشعارات، ملء الشاشة، الاحتفال */
(function () {
  'use strict';
  const AR = window.HimmaArabic;

  // append/prepend الأصليان يطبعان null نصًا؛ نتجاهل القيم الفارغة لتسهيل البناء الشرطي للعناصر
  for (const proto of [Element.prototype, DocumentFragment.prototype]) {
    for (const fn of ['append', 'prepend']) {
      const orig = proto[fn];
      proto[fn] = function (...nodes) { return orig.apply(this, nodes.filter((n) => n != null && n !== false)); };
    }
  }

  /* ===== DOM ===== */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => AR.toArabicDigits(n);

  /* ===== الطلبات ===== */
  async function api(path, opts) {
    opts = opts || {};
    const init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); if (!opts.method) init.method = 'POST'; }
    let res;
    try { res = await fetch(path, init); } catch (e) { throw new Error('تعذر الاتصال بالخادم. تأكد أن المنصة تعمل.'); }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    if (!res.ok) { const err = new Error((data && data.error) || 'حدث خطأ (' + res.status + ')'); err.status = res.status; throw err; }
    return data;
  }

  /* ===== الإشعارات ===== */
  function toast(msg, kind) {
    let host = $('.toast-host');
    if (!host) { host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    host.append(t);
    setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3500);
  }

  /* ===== الشعارات (SVG بلا نصوص عربية داخلها) ===== */
  const EMB = {
    star: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3"><path d="M50 4l13 33 33 13-33 13-13 33-13-33L4 50l33-13z"/><rect x="22" y="22" width="56" height="56" transform="rotate(45 50 50)"/><circle cx="50" cy="50" r="14"/></svg>',
    ink: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 52h28l4-14H10z"/><path d="M18 38c0-6 4-9 10-9s10 3 10 9"/><path d="M28 29V22"/><path d="M38 6l14 14-20 20-8 2 2-8z"/><path d="M46 12l6 6"/></svg>',
    scale: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M32 8v46M20 56h24M12 16h40"/><path d="M12 16L4 34h16zM52 16l-8 18h16z"/><path d="M4 34a8 5 0 0016 0M44 34a8 5 0 0016 0"/><circle cx="32" cy="10" r="3"/></svg>',
    banner: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 58V6"/><path d="M14 8h34l-8 10 8 10H14"/><circle cx="14" cy="6" r="3"/><path d="M8 58h12"/></svg>',
    lantern: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M32 4v6M24 10h16l4 8H20z"/><path d="M20 18c-4 8-4 22 0 30h24c4-8 4-22 0-30"/><path d="M32 26c-4 5-4 10 0 14 4-4 4-9 0-14z"/><path d="M22 48l-2 8h24l-2-8"/></svg>',
    crown: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22l12 10 12-18 12 18 12-10-6 26H14z"/><path d="M14 54h36"/><circle cx="8" cy="20" r="3"/><circle cx="56" cy="20" r="3"/><circle cx="32" cy="12" r="3"/></svg>',
    mask: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="32" cy="24" r="12"/><path d="M12 56c2-12 10-18 20-18s18 6 20 18"/><path d="M28 21c0-3 2-5 4-5s4 2 4 4c0 3-4 3-4 6M32 31v1"/></svg>',
    line: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 32h56"/><circle cx="12" cy="32" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="52" cy="32" r="4"/><path d="M12 28V16M32 36v12M52 28V16"/></svg>',
    net: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="32" cy="12" r="6"/><circle cx="12" cy="48" r="6"/><circle cx="52" cy="48" r="6"/><circle cx="32" cy="36" r="5"/><path d="M32 18v13M28 39l-11 6M36 39l11 6M17 48h29"/></svg>',
    shelf: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M6 56h52"/><rect x="10" y="18" width="8" height="38"/><rect x="20" y="12" width="8" height="44"/><rect x="31" y="22" width="7" height="34" transform="rotate(-12 34 39)"/><rect x="42" y="16" width="10" height="40"/></svg>',
    lens: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="26" cy="26" r="16"/><path d="M38 38l18 18"/><path d="M18 22h16M18 28h12"/></svg>',
    quill: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M54 6C36 8 22 20 16 40l-6 18"/><path d="M54 6c-4 16-14 28-34 32"/><path d="M28 26l8 4"/></svg>',
    hourglass: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 6h32M16 58h32"/><path d="M20 6c0 14 24 18 24 26S20 46 20 58M44 6c0 14-24 18-24 26s24 14 24 26"/></svg>',
    book: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M32 14c-8-6-18-6-26-4v42c8-2 18-2 26 4 8-6 18-6 26-4V10c-8-2-18-2-26 4z"/><path d="M32 14v42"/><path d="M14 22h10M14 30h10M40 22h10M40 30h10"/></svg>',
  };
  const emblem = (name, cls) => { const s = h('span', { class: cls || 'emb', 'aria-hidden': 'true' }); s.innerHTML = EMB[name] || EMB.star; return s; };

  const LOGO = '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3dc9a"/><stop offset="1" stop-color="#a8832f"/></linearGradient></defs>' +
    '<g fill="none" stroke="url(#lg)" stroke-width="4"><path d="M50 4l13 33 33 13-33 13-13 33-13-33L4 50l33-13z"/><rect x="24" y="24" width="52" height="52" transform="rotate(45 50 50)"/></g>' +
    '<path d="M50 30 L50 66 M40 44 L50 30 L60 44" fill="none" stroke="#f3dc9a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ===== الأصوات: مولدة بـ WebAudio (بلا ملفات)، قابلة للكتم ===== */
  const Sound = {
    key: 'himma-sound', ctx: null,
    get on() { try { return localStorage.getItem(this.key) !== 'off'; } catch { return true; } },
    set(v) { try { localStorage.setItem(this.key, v ? 'on' : 'off'); } catch {} document.dispatchEvent(new Event('himma-sound')); },
    tone(freq, dur, type, when, vol) {
      if (!this.on) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        const c = this.ctx, t = c.currentTime + (when || 0);
        const o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
      } catch {}
    },
    correct() { this.tone(660, .18, 'triangle'); this.tone(880, .28, 'triangle', .12); this.tone(1175, .35, 'triangle', .24, .12); },
    wrong() { this.tone(220, .25, 'sawtooth', 0, .08); this.tone(165, .4, 'sawtooth', .18, .08); },
    partial() { this.tone(520, .2, 'triangle'); this.tone(620, .3, 'triangle', .15); },
    tick() { this.tone(1200, .05, 'square', 0, .04); },
    reveal() { this.tone(440, .12, 'sine'); this.tone(554, .18, 'sine', .08); },
    fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? .9 : .22, 'triangle', i * .16, .16)); },
  };

  function soundButton() {
    const b = h('button', { class: 'btn btn-ghost icon-btn', type: 'button' });
    const paint = () => {
      b.innerHTML = Sound.on
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6M19 6a8 8 0 010 12"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
      b.title = Sound.on ? 'كتم الأصوات (M)' : 'تشغيل الأصوات (M)';
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', String(!Sound.on));
    };
    b.addEventListener('click', () => { Sound.set(!Sound.on); });
    document.addEventListener('himma-sound', paint);
    paint();
    return b;
  }

  /* ===== ملء الشاشة / البروجيكتور ===== */
  function fullscreenButton() {
    const b = h('button', { class: 'btn btn-ghost icon-btn', type: 'button', title: 'ملء الشاشة (F)', 'aria-label': 'ملء الشاشة' });
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    b.addEventListener('click', toggleFullscreen);
    return b;
  }
  function toggleFullscreen() {
    const d = document;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const el = d.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
      d.body.classList.add('projector');
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    }
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('projector'); });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'm' || e.key === 'M' || e.key === 'ة') { Sound.set(!Sound.on); }
    if (e.key === 'f' || e.key === 'F' || e.key === 'ب') { if (!e.ctrlKey && !e.metaKey) toggleFullscreen(); }
  });

  /* ===== الشريط العلوي ===== */
  function topbar(active, extra) {
    const nav = h('nav', { class: 'topnav', 'aria-label': 'التنقل الرئيسي' },
      h('a', { href: '/', class: active === 'home' ? 'active' : '' }, 'الرئيسية'),
      h('a', { href: '/host', class: 'nav-opt ' + (active === 'host' ? 'active' : '') }, 'المسابقة الجماعية'),
      h('a', { href: '/join', class: 'nav-opt ' + (active === 'join' ? 'active' : '') }, 'انضم برمز'),
      h('a', { href: '/admin', class: 'nav-opt ' + (active === 'admin' ? 'active' : '') }, 'لوحة الإدارة'),
      extra || null, soundButton(), fullscreenButton());
    const brand = h('a', { class: 'brand', href: '/', 'aria-label': 'الهمّة — الصفحة الرئيسية', html: LOGO + '<span><b>الهمّة</b><small>بالعلم نرتقي، وبالهمّة نسمو</small></span>' });
    return h('header', { class: 'topbar' }, h('div', { class: 'wrap' }, brand, nav));
  }

  function demoBanner(show) {
    if (!show) return null;
    return h('div', { class: 'demo-banner compact', role: 'note' }, 'تنبيه: المحتوى الحالي بيانات تجريبية للتجربة فقط، غير موثقة علميًا، وستُستبدل بالقائمة والمصادر المعتمدة.');
  }

  /* ===== الإحالات ===== */
  function citations(list, demo) {
    const wrap = h('div');
    if (list && list.length) {
      for (const c of list) {
        wrap.append(h('div', { class: 'cite' }, '📖 ', c.label || 'مصدر', c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener' }, 'فتح في المكتبة الشاملة') : null));
      }
    } else {
      wrap.append(h('div', { class: 'cite none' }, demo ? '⚠ معلومة تجريبية — بانتظار التوثيق من المصادر' : '⚠ لم تُرفق إحالة لهذه المعلومة بعد'));
    }
    return wrap;
  }

  /* ===== الاحتفال ===== */
  function confetti(ms) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = h('canvas', { class: 'confetti' });
    document.body.append(c);
    const ctx = c.getContext('2d');
    const resize = () => { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; };
    resize();
    const colors = ['#e3c77e', '#c9a24a', '#f5efe0', '#2f7a5b', '#4fae86', '#ffffff'];
    const parts = Array.from({ length: 180 }, () => ({
      x: Math.random() * c.width, y: -Math.random() * c.height * .6, r: (4 + Math.random() * 6) * devicePixelRatio,
      vx: (Math.random() - .5) * 2.5, vy: (2 + Math.random() * 4) * devicePixelRatio, a: Math.random() * 6, va: (Math.random() - .5) * .2,
      col: colors[Math.floor(Math.random() * colors.length)], star: Math.random() < .3,
    }));
    const end = Date.now() + (ms || 5000);
    (function frame() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.a += p.va;
        if (p.y > c.height && Date.now() < end) { p.y = -20; p.x = Math.random() * c.width; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col;
        if (p.star) { ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? p.r * .45 : p.r; ctx.lineTo(Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r); } ctx.fill(); }
        else ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      }
      if (Date.now() < end + 3000) requestAnimationFrame(frame); else c.remove();
    })();
  }

  /* ===== مؤقت دائري ===== */
  function timerEl() {
    const el = h('div', { class: 'timer', role: 'timer', 'aria-live': 'off' });
    el.innerHTML = '<svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/><circle class="fg" cx="32" cy="32" r="28" stroke-dasharray="175.9" stroke-dashoffset="0"/></svg><span>--</span>';
    const fg = el.querySelector('.fg'), sp = el.querySelector('span');
    let lastSec = null;
    el.set = (remainingMs, totalMs) => {
      const s = Math.max(0, Math.ceil(remainingMs / 1000));
      sp.textContent = num(s);
      fg.style.strokeDashoffset = String(175.9 * (1 - Math.max(0, Math.min(1, remainingMs / totalMs))));
      el.classList.toggle('low', s <= 5);
      if (s !== lastSec && s <= 5 && s > 0) Sound.tick();
      lastSec = s;
    };
    return el;
  }

  window.HimmaUI = { h, $, $$, esc, num, api, toast, emblem, EMB, LOGO, Sound, soundButton, fullscreenButton, toggleFullscreen, topbar, demoBanner, citations, confetti, timerEl };
})();
