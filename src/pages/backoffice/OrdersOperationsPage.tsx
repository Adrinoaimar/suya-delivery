import { useEffect, useMemo, useState } from 'react';
import { Bike, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Input } from '@/components/common/Input';
import { dispatchService, notificationService } from '@/lib/services';
import type { AvailableRider } from '@/lib/services';
import { useOrderStore } from '@/store/orderStore';
import { formatPrice, orderStatusLabel } from '@/utils/format';

export default function OrdersOperationsPage() {
  const orders = useOrderStore((state) => state.orders);
  const status = useOrderStore((state) => state.status);
  const error = useOrderStore((state) => state.error);
  const refresh = useOrderStore((state) => state.refresh);
  const updateStatus = useOrderStore((state) => state.updateOrderStatus);
  const [riders, setRiders] = useState<Record<string, AvailableRider[]>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const restaurantIds = useMemo(
    () => [...new Set(orders.map((order) => order.storeId))],
    [orders],
  );

  useEffect(() => {
    let active = true;
    void Promise.all(restaurantIds.map(async (restaurantId) => [
      restaurantId,
      await dispatchService.listAvailableRiders(restaurantId),
    ] as const)).then((entries) => {
      if (active) setRiders(Object.fromEntries(entries));
    }).catch((cause) => {
      if (!active) return;
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos cargar los repartidores disponibles.',
        'danger',
      );
    });
    return () => { active = false; };
  }, [restaurantIds]);

  async function assign(orderId: string, riderId: string | null) {
    setBusyOrder(orderId);
    try {
      await dispatchService.assignRider(orderId, riderId);
      await refresh();
      notificationService.notify(riderId ? 'Repartidor asignado.' : 'Asignación retirada.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos actualizar la asignación.',
        'danger',
      );
    } finally {
      setBusyOrder(null);
    }
  }

  async function cancel(orderId: string) {
    const reason = reasons[orderId]?.trim() ?? '';
    if (reason.length < 3) {
      notificationService.notify('Escribe un motivo de cancelación.', 'warning');
      return;
    }
    setBusyOrder(orderId);
    try {
      await dispatchService.cancelOrder(orderId, reason);
      await refresh();
      notificationService.notify('Pedido cancelado.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos cancelar el pedido.',
        'danger',
      );
    } finally {
      setBusyOrder(null);
    }
  }

  async function prepare(orderId: string) {
    setBusyOrder(orderId);
    try {
      await updateStatus(orderId, 'preparing');
      notificationService.notify('Preparación iniciada.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos iniciar la preparación.',
        'danger',
      );
    } finally {
      setBusyOrder(null);
    }
  }

  if (error) return <ErrorState description={error} onRetry={() => void refresh()} />;
  if (status === 'loading' && orders.length === 0) {
    return <p role="status" className="text-sm text-[#68716C]">Cargando pedidos reales…</p>;
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<UtensilsCrossed className="h-6 w-6" />}
        title="Sin pedidos operativos"
        description="Los pedidos confirmados aparecerán aquí mediante Realtime."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Pedidos</h1>
          <p className="text-sm text-[#68716C]">Preparación, asignación y cancelación auditadas.</p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Actualizar
        </Button>
      </div>

      {orders.map((order) => {
        const open = order.status !== 'delivered' && order.status !== 'cancelled';
        const assignable = order.status === 'confirmed' || order.status === 'preparing';
        return (
          <Card key={order.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display font-bold">#{order.code} · {order.storeName}</p>
                <p className="text-sm text-[#68716C]">
                  {order.customer.name} · {order.customer.address}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{orderStatusLabel(order.status)}</p>
                <p className="text-sm text-[#68716C]">{formatPrice(order.total)}</p>
              </div>
            </div>

            {assignable && (
              <div className="grid gap-3 border-t border-[#E0E5E2] pt-3 md:grid-cols-[1fr_auto]">
                <label className="text-sm font-medium">
                  <span className="mb-1 block">Repartidor</span>
                  <select
                    className="h-11 w-full rounded-btn border border-[#CDD4D0] bg-white px-3"
                    value={order.riderId ?? ''}
                    disabled={busyOrder === order.id}
                    onChange={(event) => void assign(order.id, event.target.value || null)}
                  >
                    <option value="">Sin asignar</option>
                    {order.riderId && <option value={order.riderId}>Asignado · {order.riderId.slice(0, 8)}</option>}
                    {(riders[order.storeId] ?? []).map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.name} · {rider.vehicleType || 'Vehículo por confirmar'}
                      </option>
                    ))}
                  </select>
                </label>
                {order.status === 'confirmed' && (
                  <Button
                    className="self-end"
                    disabled={busyOrder === order.id}
                    onClick={() => void prepare(order.id)}
                  >
                    <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
                    Iniciar preparación
                  </Button>
                )}
              </div>
            )}

            {open && assignable && (
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <Input
                  label="Motivo si necesitas cancelar"
                  value={reasons[order.id] ?? ''}
                  onChange={(event) => setReasons((current) => ({
                    ...current,
                    [order.id]: event.target.value,
                  }))}
                />
                <Button
                  variant="danger"
                  className="self-end"
                  disabled={busyOrder === order.id}
                  onClick={() => void cancel(order.id)}
                >
                  Cancelar pedido
                </Button>
              </div>
            )}

            {order.riderId && (
              <p className="flex items-center gap-2 text-sm text-[#68716C]">
                <Bike className="h-4 w-4" aria-hidden="true" />
                Repartidor asignado: {order.riderId.slice(0, 8)}…
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
