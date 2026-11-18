import { useEffect, useEffectEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { isNativePlatform, NATIVE_OAUTH_CALLBACK_URL } from '@/lib/auth/oauth';
import { useAuthStore } from '@/store/authStore';

export function AuthBootstrap() {
  const navigate = useNavigate();
  const open = useEffectEvent((path: string) => navigate(path, { replace: true }));
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void initialize().then((cleanup) => {
      if (cancelled) cleanup();
      else unsubscribe = cleanup;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [initialize]);

  useEffect(() => {
    if (!isNativePlatform()) return;

    let cancelled = false;
    let lastUrl: string | null = null;
    const complete = async (url: string) => {
      if (cancelled || url === lastUrl) return;
      lastUrl = url;
      const order = /^com\.suya\.app:\/\/orders\/([a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i.exec(url);
      if (order) {
        open(`/orders/${order[1]}`);
        return;
      }
      if (url.split(/[?#]/, 1)[0] !== NATIVE_OAUTH_CALLBACK_URL) return;
      try {
        const returnTo = await useAuthStore.getState().completeOAuthCallback(url);
        if (returnTo && !cancelled) open(returnTo);
      } catch {
        // El store muestra el error seguro en la pantalla de acceso.
      }
    };

    const listener = App.addListener('appUrlOpen', ({ url }) => void complete(url));
    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) void complete(launch.url);
    });

    return () => {
      cancelled = true;
      void listener.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
