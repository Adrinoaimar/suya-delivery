import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  analyticsConfigured,
  getAnalyticsConsent,
  normalizeAnalyticsKey,
  recordConsentVisitor,
  setAnalyticsConsent,
  track,
  type AnalyticsConsent,
} from '@/lib/analytics';

function ConsentBanner({
  onChange,
}: {
  onChange: (value: Exclude<AnalyticsConsent, null>) => void;
}) {
  return (
    <aside
      role="dialog"
      aria-label="Preferencias de analítica"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-xl rounded-2xl border border-suya-mist bg-white p-4 shadow-soft"
    >
      <p className="font-display text-sm font-bold text-suya-carbon">Ayúdanos a mejorar Suya</p>
      <p className="mt-1 text-xs leading-5 text-suya-muted">
        Contamos visualizaciones y clics de forma agregada, sin IP ni identificadores. Las visitas
        únicas requieren tu consentimiento; no activamos publicidad personalizada.
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="min-h-11 rounded-btn px-3 text-sm font-semibold text-suya-muted hover:bg-suya-ivory"
          onClick={() => onChange('denied')}
        >
          Solo necesaria
        </button>
        <button
          type="button"
          className="min-h-11 rounded-btn bg-suya-green px-4 text-sm font-semibold text-white hover:bg-suya-green-dark"
          onClick={() => onChange('granted')}
        >
          Aceptar analítica
        </button>
      </div>
    </aside>
  );
}

/** Inicializa analítica agregada y registra páginas/clics sin identificadores personales. */
export function AnalyticsBootstrap() {
  const location = useLocation();
  const [consent, setConsent] = useState<AnalyticsConsent>(() => getAnalyticsConsent());
  const configured = analyticsConfigured();

  useEffect(() => {
    if (!configured) return;
    track('page_view', { page_key: location.pathname });
  }, [configured, location.pathname]);

  useEffect(() => {
    if (!configured) return undefined;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a');
      if (!anchor || anchor.hasAttribute('download')) return;
      const explicitKey = anchor.getAttribute('data-analytics-key');
      const href = anchor.getAttribute('href');
      if (!explicitKey && !href) return;
      const key = normalizeAnalyticsKey(explicitKey ?? href);
      if (key) track('link_click', { link_key: key });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [configured]);

  if (!configured || consent !== null) return null;

  return (
    <ConsentBanner
      onChange={(value) => {
        setAnalyticsConsent(value);
        setConsent(value);
        if (value === 'granted') recordConsentVisitor();
      }}
    />
  );
}
