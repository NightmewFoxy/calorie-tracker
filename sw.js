// Offline shell: always try the network first so app updates show up on the next open;
// fall back to the cached copy when offline or the network is slow.
const CACHE = 'calories-v4';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'fooddb.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // sheet sync always goes to the network
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const fresh = fetch(e.request, { cache: 'no-cache' }).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; });
    const slow = new Promise((r) => setTimeout(r, 4000)).then(() => c.match(e.request, { ignoreSearch: true }));
    try {
      const res = await Promise.race([fresh, slow]);
      if (res) return res;
      return await fresh;
    } catch (err) {
      return (await c.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  }));
});
