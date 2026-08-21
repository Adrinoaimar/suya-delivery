import type { ReactNode } from 'react';
import { ScrollToTop } from '@/app/ScrollToTop';
import { SuyaIntroLoader } from '@/components/common/SuyaIntroLoader';
import { ToastViewport } from '@/components/common/Toast';
import { useIntro } from '@/hooks/useIntro';

function introDurationOverride(): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const raw = new URLSearchParams(window.location.search).get('intro');
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function AppShell({ children }: { children: ReactNode }) {
  const intro = useIntro();

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-btn focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-suya-green"
      >
        Saltar al contenido
      </a>
      <ScrollToTop />
      {children}
      <ToastViewport />
      {intro.visible && (
        <SuyaIntroLoader onFinish={intro.finish} minDuration={introDurationOverride()} />
      )}
    </>
  );
}
