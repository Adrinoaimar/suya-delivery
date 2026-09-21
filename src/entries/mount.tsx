import { StrictMode } from 'react';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { AuthBootstrap } from '@/app/AuthBootstrap';
import { CatalogBootstrap } from '@/app/CatalogBootstrap';
import { syncMobileLiveUpdate } from '@/lib/liveUpdate';
import { removeStaleCustomerServiceWorker } from '@/lib/serviceWorker';
import '@/styles/index.css';

interface MountOptions {
  Bootstrap?: ComponentType;
  /** Skips auth/session work for native utility surfaces with their own pairing flow. */
  bootstrapAuth?: boolean;
  /** Starts the customer catalog while the intro is still visible. */
  preloadCatalog?: boolean;
  registerServiceWorker?: boolean;
  /** Enables consented first-party visitor counting for the public customer site only. */
  analyticsEnabled?: boolean;
}

export function mountApp(Routes: ComponentType, options: MountOptions = {}): void {
  const container = document.getElementById('root');
  if (!container) throw new Error('No se encontró el contenedor #root');

  const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter basename={basename}>
        <AppShell analyticsEnabled={options.analyticsEnabled}>
          {options.bootstrapAuth !== false && <AuthBootstrap />}
          {options.preloadCatalog && <CatalogBootstrap />}
          {options.Bootstrap && <options.Bootstrap />}
          <Routes />
        </AppShell>
      </BrowserRouter>
    </StrictMode>,
  );

  void syncMobileLiveUpdate();

  const mobileRole = import.meta.env.VITE_MOBILE_ROLE?.trim();
  if (
    import.meta.env.PROD &&
    !options.registerServiceWorker &&
    (mobileRole === 'rider' || mobileRole === 'backoffice')
  ) {
    removeStaleCustomerServiceWorker();
  }

  if (options.registerServiceWorker && import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    });
  }
}
