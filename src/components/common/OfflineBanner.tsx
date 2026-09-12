import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** Alto reservado por el aviso mientras está visible; lo consume el dock de avisos. */
const DOCK_VARIABLE = '--offline-dock';

function readInitialOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  // `onLine` puede no existir en entornos de prueba: se asume conectado.
  return navigator.onLine !== false;
}

/**
 * Aviso persistente de conexión perdida.
 *
 * Es solo informativo: no bloquea la interfaz ni reintenta peticiones por su cuenta,
 * porque cada pantalla ya gestiona su propio estado de error y reintento.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(readInitialOnline);

  useEffect(() => {
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Los toasts se apilan encima del aviso en lugar de solaparse con él.
  useEffect(() => {
    const root = document.documentElement;
    if (online) {
      root.style.removeProperty(DOCK_VARIABLE);
    } else {
      root.style.setProperty(DOCK_VARIABLE, '56px');
    }
    return () => {
      root.style.removeProperty(DOCK_VARIABLE);
    };
  }, [online]);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="suya-lens-dark fixed inset-x-4 bottom-[calc(var(--bottom-nav-space)+8px)] z-[55] flex items-center gap-2.5 rounded-btn px-3.5 py-2.5 text-white motion-safe:animate-slide-up sm:inset-x-auto sm:right-6 sm:max-w-sm lg:bottom-6"
    >
      <WifiOff aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-suya-sun" />
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
        Sin conexión. Puedes seguir viendo lo ya cargado.
      </p>
    </div>
  );
}
