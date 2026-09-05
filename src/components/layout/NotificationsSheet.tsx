import { BellOff, ExternalLink, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { CodeDialog } from '@/components/order/CodeDialog';
import { useOrderStore } from '@/store/orderStore';
import { formatDateTime, orderStatusLabel } from '@/utils/format';

interface NotificationsSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Avisos generados por la simulación local de pedidos.
 * FUTURE: replace local implementation with push notifications.
 */
export function NotificationsSheet({ open, onClose }: NotificationsSheetProps) {
  const orders = useOrderStore((state) => state.orders);
  const cancelOrder = useOrderStore((state) => state.cancelOrder);
  const navigate = useNavigate();
  const [cancelId, setCancelId] = useState<string | null>(null);

  const events = orders
    .flatMap((order) =>
      order.history.map((event) => ({
        key: `${order.id}-${event.status}-${event.at}`,
        code: order.code,
        orderId: order.id,
        storeName: order.storeName,
        status: event.status,
        at: event.at,
        isLatest: order.history.at(-1)?.at === event.at,
      })),
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);

  return (
    <Modal open={open} onClose={onClose} title="Notificaciones">
      {events.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-6 w-6" />}
          title="Sin novedades por ahora"
          description="Aquí verás el avance de tus pedidos."
        />
      ) : (
        <ul className="divide-y divide-suya-mist">
          {events.map((event) => (
            <li key={event.key} className="flex items-start gap-3 py-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-suya-lime" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{orderStatusLabel(event.status)}</p>
                <p className="text-sm text-[#6B7076]">
                  {event.storeName} · #{event.code}
                </p>
                <p className="text-xs text-[#9AA0A6]">{formatDateTime(event.at)}</p>
                {event.isLatest && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { onClose(); navigate(`/orders/${event.orderId}/track`); }}>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ver estado
                    </Button>
                    {['confirmed', 'preparing', 'picked_up', 'on_the_way'].includes(event.status) && (
                      <Button size="sm" variant="danger" onClick={() => setCancelId(event.orderId)}>
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Cancelar
                      </Button>
                    )}
                    {['picked_up', 'on_the_way'].includes(event.status) && (
                      <p className="basis-full text-xs text-[#6B7076]">Se cancelará con confirmación y código, aunque ya esté en ruta.</p>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {cancelId && (() => {
        const order = orders.find((item) => item.id === cancelId);
        if (!order) return null;
        return <CodeDialog open onClose={() => setCancelId(null)} title="¿Cancelar el pedido?" description="Escribe tu código de cancelación para confirmar." helper={`Código del pedido #${order.code}.`} confirmLabel="Cancelar pedido" tone="danger" onSubmit={(code) => cancelOrder(order.id, code)} onSuccess={() => setCancelId(null)} />;
      })()}
    </Modal>
  );
}
