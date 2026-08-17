import { useEffect, useState } from 'react';
import { notificationService, progressForElapsed } from '@/lib/services';
import { useOrderStore } from '@/store/orderStore';
import { useUserStore } from '@/store/userStore';
import { orderStatusLabel } from '@/utils/format';
import type { Order, OrderStatus } from '@/types';

/**
 * Simulación local de «tiempo real».
 *
 * Un único intervalo de 1 s recorre los pedidos activos y avanza sus estados.
 * FUTURE: replace local implementation with realtime backend (WebSocket / push).
 */
export function useOrderSimulationRunner(): void {
  const tick = useOrderStore((state) => state.tick);
  const orders = useOrderStore((state) => state.orders);

  useEffect(() => {
    const active = orders.some(
      (order) =>
        order.simulationStartedAt !== null &&
        order.status !== 'delivered' &&
        order.status !== 'cancelled',
    );
    if (!active) return undefined;

    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [orders, tick]);
}

/**
 * Avisa con un toast cada vez que cambia el estado del pedido seguido.
 * Respeta la preferencia «Avisos de pedidos» del perfil.
 */
export function useOrderStatusNotifier(order: Order | undefined): void {
  const [lastStatus, setLastStatus] = useState<OrderStatus | null>(null);
  const notificationsEnabled = useUserStore((state) => state.preferences.notifications);

  useEffect(() => {
    if (!order) return;
    if (lastStatus === null) {
      setLastStatus(order.status);
      return;
    }
    if (order.status === lastStatus) return;
    setLastStatus(order.status);
    if (!notificationsEnabled) return;
    notificationService.notify(
      `${order.code}: ${orderStatusLabel(order.status)}`,
      order.status === 'delivered' ? 'success' : 'info',
    );
  }, [order, lastStatus, notificationsEnabled]);
}

/** Progreso 0–1 del repartidor sobre la ruta, actualizado cada 900 ms. */
export function useRouteProgress(order: Order | undefined): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!order?.simulationStartedAt) {
      setProgress(order?.status === 'delivered' ? 1 : 0);
      return undefined;
    }
    if (order.status === 'delivered') {
      setProgress(1);
      return undefined;
    }
    if (order.status === 'cancelled') {
      return undefined;
    }

    const update = () => {
      setProgress(progressForElapsed(Date.now() - (order.simulationStartedAt ?? Date.now())));
    };
    update();
    const timer = window.setInterval(update, 900);
    return () => window.clearInterval(timer);
  }, [order?.simulationStartedAt, order?.status]);

  return progress;
}
