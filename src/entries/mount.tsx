import { StrictMode } from 'react';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import '@/styles/index.css';

interface MountOptions {
  Bootstrap?: ComponentType;
  registerServiceWorker?: boolean;
}

export function mountApp(Routes: ComponentType, options: MountOptions = {}): void {
  const container = document.getElementById('root');
  if (!container) throw new Error('No se encontró el contenedor #root');

  const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter basename={basename}>
        <AppShell>
          {options.Bootstrap && <options.Bootstrap />}
          <Routes />
        </AppShell>
      </BrowserRouter>
    </StrictMode>,
  );

  if (options.registerServiceWorker && import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    });
  }
}
