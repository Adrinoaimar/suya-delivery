import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useOrderNotifications } from '@/hooks/useOrderNotifications';
import { orderService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { useOrderStore } from '@/store/orderStore';

const ORDER_SYNC_INTERVAL_MS = 30_000;

export function OrderBootstrap() {
  useOrderNotifications();
  const identityId = useAuthStore((state) => state.identity?.id ?? null);
  const reset = useOrderStore((state) => state.reset);
  const hydrate = useOrderStore((state) => state.hydrate);
  const refresh = useOrderStore((state) => state.refresh);

  useEffect(() => {
    reset();
    if (!identityId) return;
    let disposed = false;
    let reconciling = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function syncOrders() {
      if (disposed) return;
      if (reconciling) {
        pending = true;
        return;
      }
      reconciling = true;
      try {
        await refresh({ background: true });
      } finally {
        reconciling = false;
        if (pending && !disposed) {
          pending = false;
          scheduleRefresh();
        }
      }
    }

    function scheduleRefresh() {
      if (disposed || document.hidden || !navigator.onLine) return;
      clearTimeout(timer);
      timer = setTimeout(() => void syncOrders(), 150);
    }

    reconciling = true;
    void hydrate().finally(() => {
      reconciling = false;
      if (pending) {
        pending = false;
        scheduleRefresh();
      }
    });
    const unsubscribe = orderService.subscribe(scheduleRefresh);
    const interval = window.setInterval(scheduleRefresh, ORDER_SYNC_INTERVAL_MS);
    const resume = Capacitor.isNativePlatform()
      ? App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) scheduleRefresh();
        })
      : undefined;
    window.addEventListener('online', scheduleRefresh);
    document.addEventListener('visibilitychange', scheduleRefresh);

    return () => {
      disposed = true;
      clearTimeout(timer);
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener('online', scheduleRefresh);
      document.removeEventListener('visibilitychange', scheduleRefresh);
      if (resume) void resume.then((listener) => listener.remove());
    };
  }, [hydrate, identityId, refresh, reset]);
  return null;
}
