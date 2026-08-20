import { useEffect } from 'react';
import { orderService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { useOrderStore } from '@/store/orderStore';

export function OrderBootstrap() {
  const identityId = useAuthStore((state) => state.identity?.id ?? null);
  const reset = useOrderStore((state) => state.reset);
  const hydrate = useOrderStore((state) => state.hydrate);
  const refresh = useOrderStore((state) => state.refresh);

  useEffect(() => {
    reset();
    if (!identityId) return;
    void hydrate();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = orderService.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [hydrate, identityId, refresh, reset]);
  return null;
}
