import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  analyticsConfigured,
  captureCampaign,
  getAnalyticsConsent,
  setAnalyticsConsent,
  track,
  type AnalyticsConsent,
} from '@/lib/analytics';

function ConsentBanner({ onChange }: { onChange: (value: Exclude<AnalyticsConsent, null>) => void }) {
  return (
    <aside
      role="dialog"
      aria-label="Preferencias de analítica"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-xl rounded-2xl border border-suya-mist bg-white p-4 shadow-soft"
    >
      <p className="font-display text-sm font-bold text-suya-carbon">Ayúdanos a mejorar Suya</p>
      <p className="mt-1 text-xs leading-5 text-suya-muted">
        Usamos analítica anónima para medir visitas y pedidos. No activamos publicidad personalizada
        y puedes cambiar esta decisión borrando la preferencia del navegador.
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

/** Inicializa analítica opt-in y registra páginas/campañas sin enviar PII. */
export function AnalyticsBootstrap() {
  const location = useLocation();
  const [consent, setConsent] = useState<AnalyticsConsent>(() => getAnalyticsConsent());
  const configured = analyticsConfigured();

  useEffect(() => {
    if (!configured) return;
    const campaign = captureCampaign(location.search);
    if (consent === 'granted') {
      track('page_view', {
        page_path: `${location.pathname}${location.search}`,
        page_location: window.location.href,
        ...campaign,
      });
    }
  }, [configured, consent, location.pathname, location.search]);

  if (!configured || consent !== null) return null;

  return (
    <ConsentBanner
      onChange={(value) => {
        setAnalyticsConsent(value);
        setConsent(value);
        if (value === 'granted') {
          track('page_view', {
            page_path: `${window.location.pathname}${window.location.search}`,
            page_location: window.location.href,
            ...captureCampaign(window.location.search),
          });
        }
      }}
    />
  );
}

