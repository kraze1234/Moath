/* عامل الخدمة: تخزين واجهة المنصة للعمل دون اتصال بعد أول زيارة (الأسئلة تأتي من الخادم المحلي) */
const CACHE = 'himma-v1';
const SHELL = ['/', '/play', '/host', '/join', '/css/himma.css', '/js/ui.js', '/js/qtypes.js', '/js/home.js', '/js/play.js', '/js/host.js', '/js/join.js',
  '/shared/arabic.js', '/shared/catalog.js', '/shared/engine.js', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (u.pathname.startsWith('/fonts/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return res; })));
    return;
  }
  // الشبكة أولًا ثم المخزن
  e.respondWith(fetch(e.request).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return res; }).catch(() => caches.match(e.request)));
});
