// عامل الخدمة: يخزّن واجهة التطبيق والدرس ليعمل بلا إنترنت
// غيّر SHELL_VERSION عند تحديث ملفات الواجهة
const SHELL_VERSION = 'v6-2026-11-14';
const SHELL = 'um-shell-' + SHELL_VERSION;
const CONTENT = 'um-content';

const SHELL_FILES = [
  './', 'index.html', 'sheikh.html', 'book.html', 'js/book.js', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/pilgrim.js', 'js/sheikh.js', 'js/core/arabic.js', 'js/core/blocks.js', 'js/core/blocks-builtin.js',
  'js/core/dom.js', 'js/core/pack.js', 'js/core/relay.js', 'js/core/render.js', 'js/core/store.js',
  'js/core/offline.js', 'js/core/deter.js', 'js/core/ui.js', 'js/core/stage.js', 'js/core/block-diagram.js', 'js/core/diagram-body.js', 'js/core/block-ayah.js', 'js/core/audio.js', 'js/recite.js',
  'assets/img/logo-mark.jpg', 'assets/img/logo-full.png', 'assets/img/icon-192.png',
  'assets/fonts/tajawal-arabic-400-normal.woff2', 'assets/fonts/tajawal-arabic-500-normal.woff2',
  'assets/fonts/tajawal-arabic-700-normal.woff2', 'assets/fonts/tajawal-arabic-800-normal.woff2',
  'assets/fonts/tajawal-latin-400-normal.woff2', 'assets/fonts/tajawal-latin-700-normal.woff2',
  'assets/fonts/tajawal-latin-800-normal.woff2', 'assets/fonts/tajawal-latin-500-normal.woff2',
  'assets/fonts/noto-naskh-arabic-arabic-400-normal.woff2', 'assets/fonts/noto-naskh-arabic-arabic-600-normal.woff2', 'assets/fonts/noto-naskh-arabic-arabic-700-normal.woff2',
  'content/pack.json',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    // نخزّن كل ملف على حدة حتى لا يفشل التثبيت كله بسبب ملف واحد
    await Promise.all(SHELL_FILES.filter(f => !f.startsWith('content/')).map(f => shell.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    const content = await caches.open(CONTENT);
    await content.add(new Request('content/pack.json', { cache: 'reload' })).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('um-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // يوتيوب والمرحّل: من الشبكة مباشرة
  const path = url.pathname;

  // الحزمة: الشبكة أولاً (مع مهلة لضعف الشبكة) ثم المخزّن
  if (path.endsWith('/content/pack.json')) {
    e.respondWith((async () => {
      const cache = await caches.open(CONTENT);
      try {
        const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(5000)]);
        if (res.ok) cache.put('content/pack.json', res.clone());
        return res;
      } catch {
        return (await cache.match('content/pack.json')) || new Response('{"error":"offline"}', { status: 503, headers: { 'content-type': 'application/json' } });
      }
    })());
    return;
  }
  // الصور والصوت: من المخزّن أولاً
  if (path.includes('/content/media/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CONTENT);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  // الواجهة: من المخزّن فوراً مع تحديث في الخلفية
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || new Response('بلا اتصال', { status: 503 });
    return new Response('', { status: 504 });
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
