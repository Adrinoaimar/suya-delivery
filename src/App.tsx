import { ScrollToTop } from '@/app/ScrollToTop';
import { SuyaIntroLoader } from '@/components/common/SuyaIntroLoader';
import { ToastViewport } from '@/components/common/Toast';
import { useIntro } from '@/hooks/useIntro';
import { useOrderBootstrap } from '@/hooks/useOrders';
import { AppRoutes } from '@/routes/AppRoutes';

/**
 * Solo en desarrollo: `?intro=8000` alarga la animación de entrada para poder revisarla
 * con calma. En producción siempre dura lo definido por el componente.
 */
function introDurationOverride(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const raw = new URLSearchParams(window.location.search).get('intro');
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export default function App() {
  const intro = useIntro();
  useOrderBootstrap();

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-btn focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-suya-green"
      >
        Saltar al contenido
      </a>
      <ScrollToTop />
      {/* La aplicación se prepara detrás mientras la animación de entrada se reproduce. */}
      <AppRoutes />
      <ToastViewport />
      {intro.visible && (
        <SuyaIntroLoader onFinish={intro.finish} minDuration={introDurationOverride()} />
      )}
    </>
  );
}
