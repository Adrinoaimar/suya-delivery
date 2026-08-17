import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Cada navegación arranca arriba, como en una aplicación nativa. */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return null;
}
