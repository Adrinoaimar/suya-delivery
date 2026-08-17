import { BellOff } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/EmptyState';
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

  const events = orders
    .flatMap((order) =>
      order.history.map((event) => ({
        key: `${order.id}-${event.status}-${event.at}`,
        code: order.code,
        storeName: order.storeName,
        status: event.status,
        at: event.at,
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
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{orderStatusLabel(event.status)}</p>
                <p className="text-sm text-[#6B7076]">
                  {event.storeName} · #{event.code}
                </p>
                <p className="text-xs text-[#9AA0A6]">{formatDateTime(event.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
