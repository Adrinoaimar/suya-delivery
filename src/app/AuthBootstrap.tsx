import { useEffect } from 'react';
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

  return null;
}
