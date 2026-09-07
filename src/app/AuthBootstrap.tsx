import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { isNativePlatform } from '@/lib/auth/oauth';
import { useAuthStore } from '@/store/authStore';

export function AuthBootstrap() {
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
      try {
        const returnTo = await useAuthStore.getState().completeOAuthCallback(url);
        if (returnTo && !cancelled) window.location.replace(returnTo);
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
