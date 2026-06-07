const CACHE = 'kicklive-v1';
const STATIC = ['/', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // API calls: network first, no cache
  if (url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ matches: [], standings: {}, error: 'offline' }), { headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  // Static: cache first
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
    if (res.ok && e.request.method === 'GET') {
      caches.open(CACHE).then(c => c.put(e.request, res.clone()));
    }
    return res;
  }).catch(() => cached)));
});
