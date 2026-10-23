// Service worker : rend le site installable comme une appli (Android, iPhone,
// ordinateur) et permet d'ouvrir l'écran de jeu sans connexion (mode tablette
// unique et Buzzers « sur cet écran » marchent alors hors ligne).
//
// Stratégie « réseau d'abord » : en ligne, on a toujours la dernière version du
// site (pas de vieille version coincée en mémoire) ; hors ligne, on sert la
// copie gardée en mémoire. Les WebSocket (/ws) et la voix ne passent pas ici.

const CACHE = 'bq-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const files = await (await fetch('/api/precache', { cache: 'no-store' })).json();
        await Promise.all(files.map((f) => cache.add(new Request(f, { cache: 'no-cache' })).catch(() => {})));
      } catch {}
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/sounds') return;
  if (url.pathname === '/qr.svg') return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(e.request);
        if (res.ok && res.type === 'basic') cache.put(e.request, res.clone());
        return res;
      } catch (err) {
        const hit = (await cache.match(e.request)) || (await cache.match(e.request, { ignoreSearch: true }));
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});
