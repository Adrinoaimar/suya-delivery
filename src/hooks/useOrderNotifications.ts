import { useEffect } from 'react';
import { nativeOrderNotifications, supportsOrderNotifications } from '@/lib/nativeOrderNotifications';
import { useAuthStore } from '@/store/authStore';
import { useOrderStore } from '@/store/orderStore';
import type { OrderStatus } from '@/types';
import { orderNotificationItemLabel, orderStatusLabel } from '@/utils/format';

export function useOrderNotifications(): void {
  useEffect(() => {
    if (!supportsOrderNotifications()) return;

    let identityId = useAuthStore.getState().identity?.id;
    let watchingSince = Date.now();
    const previousStatuses = new Map<string, OrderStatus>();
    const unsubscribeAuth = useAuthStore.subscribe(({ identity, status }) => {
      if (status === 'loading' || identityId === identity?.id) return;
      if (identityId) void nativeOrderNotifications.clear().catch(() => undefined);
      identityId = identity?.id;
      previousStatuses.clear();
      watchingSince = Date.now();
    });
    const unsubscribeOrders = useOrderStore.subscribe((current, previous) => {
      if (!identityId || current.status !== 'ready' || current.orders === previous.orders) return;

      for (const order of current.orders) {
        if (order.customerId !== identityId) continue;
        const lastStatus = previousStatuses.get(order.id);
        previousStatuses.set(order.id, order.status);
        if (lastStatus === order.status) continue;
        const newOrder = Date.parse(order.createdAt) >= watchingSince;
        if (!lastStatus && (!newOrder || order.status === 'pending_payment')) continue;
        void nativeOrderNotifications.show({
          orderId: order.id,
          title: `Tu pedido de ${order.storeName}`.slice(0, 90),
          message: [orderNotificationItemLabel(order.items)?.slice(0, 60), orderStatusLabel(order.status)]
            .filter(Boolean).join(' · '),
        }).catch(() => undefined);
      }
    });
    return () => {
      unsubscribeAuth();
      unsubscribeOrders();
    };
  }, []);
}
