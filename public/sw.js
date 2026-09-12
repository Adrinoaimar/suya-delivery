/*
 * Service worker mínimo de Suya Delivery.
 * Solo se registra en la aplicación de clientes y mantiene una caché de shell básica.
 *
 * Todas las rutas se resuelven contra el scope, para que funcione tanto en la raíz
 * de un dominio como bajo /<repo>/ en GitHub Pages.
 */
const CACHE = 'suya-shell-v3';
const ROOT = new URL('./', self.location);
const INDEX = new URL('index.html', ROOT).pathname;
const SHELL = [
  ROOT.pathname,
  INDEX,
  new URL('brand/suya-icon.svg', ROOT).pathname,
  new URL('manifest/manifest.webmanifest', ROOT).pathname,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Navegación: red primero y, sin conexión, el index cacheado (rutas SPA).
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(INDEX)));
    return;
  }

  const url = new URL(request.url);
  const mutableAsset = url.pathname.includes('/brand/') || url.pathname.includes('/images/');
  if (mutableAsset) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
