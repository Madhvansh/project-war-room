// WAR ROOM — service worker (Open-Wave remote-access slate, OPT-IN).
// Registered only after a visit with ?pwa=1 (see index.html), so the default
// localhost / `npm test` / headless-Edge audit paths never see it.
//
// It caches the APP SHELL for offline Tier B reps on the phone. It NEVER
// intercepts /api/* or /evidence/* — data, the Coach (claude -p) and saved PNGs
// always hit the live server, honouring §1 ("offline-capable EXCEPT the Coach
// calls and external links"). app.js statically imports every view, so one
// online visit runtime-caches the whole SPA.
const CACHE = 'p435-v2'; // v2: SEASON 3 (cache-first has no revalidation — every shipped-content change must bump this)
const SHELL = [
  '/', '/app.css', '/app.js', '/laws.js', '/audio.js', '/stats.js',
  '/curriculum.json', '/problems.json', '/manifest.json', '/icon-192.png', '/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;             // never touch state writes
  if (url.pathname.startsWith('/api/')) return;        // data + coach: live only
  if (url.pathname.startsWith('/evidence/')) return;   // saved receipts: live files
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)); // runtime-cache the SPA
      }
      return res;
    }).catch(() => caches.match('/'))) // offline + uncached navigation → the app shell
  );
});
