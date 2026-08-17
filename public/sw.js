/*
 * Service worker mínimo de Suya Delivery.
 * Solo habilita la instalación como PWA y una caché de shell básica.
 * No sincroniza datos: la demo funciona íntegramente con localStorage.
 *
 * Todas las rutas se resuelven contra el scope, para que funcione tanto en la raíz
 * de un dominio como bajo /<repo>/ en GitHub Pages.
 */
const CACHE = 'suya-shell-v2';
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

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
