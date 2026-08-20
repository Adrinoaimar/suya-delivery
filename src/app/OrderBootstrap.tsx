import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useOrderStore } from '@/store/orderStore';

export function OrderBootstrap() {
  const identityId = useAuthStore((state) => state.identity?.id ?? null);
  const reset = useOrderStore((state) => state.reset);
  const hydrate = useOrderStore((state) => state.hydrate);

  useEffect(() => {
    reset();
    if (identityId) void hydrate();
  }, [hydrate, identityId, reset]);
  return null;
}
