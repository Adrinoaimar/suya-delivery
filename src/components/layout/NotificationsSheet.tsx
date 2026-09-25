import { BellOff, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { isPendingDigitalPayment } from '@/lib/orderOperations';
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
  const navigate = useNavigate();

  const events = orders
    .flatMap((order) =>
      order.history.map((event) => ({
        key: `${order.id}-${event.status}-${event.at}`,
        code: order.code,
        orderId: order.id,
        storeName: order.storeName,
        status:
          event.status === 'confirmed' && isPendingDigitalPayment(order)
            ? 'pending_payment'
            : event.status,
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
                    <Button size="sm" variant="ghost" onClick={() => { onClose(); navigate(`/orders/${event.orderId}`); }}>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ver pedido
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
