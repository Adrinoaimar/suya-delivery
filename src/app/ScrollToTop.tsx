import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Cada navegación arranca arriba, como en una aplicación nativa. */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Navigation starts at the top. `auto` is supported by WebView and keeps
    // route changes from fighting the global smooth-scroll preference.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}
