import { useEffect, useState } from 'react';
import { notificationService } from '@/lib/services';
import { useOrderStore } from '@/store/orderStore';
import { orderStatusLabel } from '@/utils/format';
import type { Order, OrderStatus } from '@/types';

export function useOrderBootstrap(): void {
  const hydrate = useOrderStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);
}

export function useOrderStatusNotifier(order: Order | undefined): void {
  const [lastStatus, setLastStatus] = useState<OrderStatus | null>(null);

  useEffect(() => {
    if (!order) return;
    if (lastStatus === null) {
      setLastStatus(order.status);
      return;
    }
    if (order.status === lastStatus) return;
    setLastStatus(order.status);
    notificationService.notify(
      `${order.code}: ${orderStatusLabel(order.status)}`,
      order.status === 'delivered' ? 'success' : 'info',
    );
  }, [lastStatus, order]);
}

export function orderRouteProgress(order: Order | undefined): number {
  if (!order) return 0;
  const progress: Record<OrderStatus, number> = {
    confirmed: 0,
    preparing: 0,
    picked_up: 0.1,
    on_the_way: 0.55,
    delivered: 1,
    cancelled: 0,
  };
  return progress[order.status];
}
