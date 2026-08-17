import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el contenedor #root');

// `BASE_URL` permite servir la app en la raíz de un dominio o bajo /<repo>/ (GitHub Pages).
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// PWA: el service worker solo se registra en producción para no interferir con el dev server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* la aplicación funciona igual sin service worker */
    });
  });
}
