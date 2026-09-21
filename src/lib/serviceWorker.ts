/**
 * Retira el Service Worker/cache del cliente si un dominio operativo fue servido
 * anteriormente con el bundle PWA de Cliente. Solo se invoca desde Rider/Back Office
 * en producción; nunca toca el registro PWA del Cliente.
 */
export function removeStaleCustomerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const cleanup = () => {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);

    if ('caches' in window) {
      void window.caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith('suya-shell-'))
              .map((key) => window.caches.delete(key)),
          ),
        )
        .catch(() => undefined);
    }
  };

  if (document.readyState === 'complete') cleanup();
  else window.addEventListener('load', cleanup, { once: true });
}
