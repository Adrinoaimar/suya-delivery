import { useLayoutEffect, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { AnalyticsBootstrap } from '@/app/AnalyticsBootstrap';
import { ScrollToTop } from '@/app/ScrollToTop';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import { SuyaIntroLoader } from '@/components/common/SuyaIntroLoader';
import { ToastViewport } from '@/components/common/Toast';
import { useIntro } from '@/hooks/useIntro';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

function introDurationOverride(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const raw = new URLSearchParams(window.location.search).get('intro');
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function AppShell({
  children,
  analyticsEnabled = false,
}: {
  children: ReactNode;
  analyticsEnabled?: boolean;
}) {
  const intro = useIntro();
  const reduceMotion = usePrefersReducedMotion();
  const showIntro = Capacitor.isNativePlatform() && intro.visible;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.reduceMotion = String(reduceMotion);

    return () => {
      delete root.dataset.reduceMotion;
    };
  }, [reduceMotion]);

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:min-h-11 focus:rounded-btn focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-suya-green"
      >
        Saltar al contenido
      </a>
      <ScrollToTop />
      {analyticsEnabled && <AnalyticsBootstrap />}
      {children}
      <OfflineBanner />
      <ToastViewport />
      {showIntro && (
        <SuyaIntroLoader onFinish={intro.finish} minDuration={introDurationOverride()} />
      )}
    </>
  );
}
