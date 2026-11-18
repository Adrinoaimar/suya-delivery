import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Bell, BellOff, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { nativeOrderNotifications, supportsOrderNotifications } from '@/lib/nativeOrderNotifications';
import { isPendingDigitalPayment } from '@/lib/orderOperations';
import { useOrderStore } from '@/store/orderStore';
import { formatDateTime, orderNotificationItemLabel, orderStatusLabel } from '@/utils/format';

interface NotificationsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsSheet({ open, onClose }: NotificationsSheetProps) {
  const orders = useOrderStore((state) => state.orders);
  const navigate = useNavigate();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const supportsNative = supportsOrderNotifications();

  useEffect(() => {
    if (!open || !supportsNative) return;
    let active = true;
    const check = () => {
      void nativeOrderNotifications.check().then((result) => {
        if (active) setEnabled(result.enabled);
      }).catch(() => {
        if (active) setPermissionError(true);
      });
    };
    check();
    const resume = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) check();
    });
    return () => {
      active = false;
      void resume.then((listener) => listener.remove());
    };
  }, [open, supportsNative]);

  async function enableNotifications() {
    setPermissionError(false);
    setRequestingPermission(true);
    try {
      const result = permissionRequested
        ? await nativeOrderNotifications.openSettings()
        : await nativeOrderNotifications.enable();
      setEnabled(result.enabled);
      setPermissionRequested(true);
    } catch {
      setPermissionError(true);
    } finally {
      setRequestingPermission(false);
    }
  }

  const events = orders
    .flatMap((order) =>
      order.history.map((event) => ({
        key: `${order.id}-${event.status}-${event.at}`,
        itemLabel: orderNotificationItemLabel(order.items),
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
      {supportsNative && (
        <div className="mb-3 rounded-btn border border-suya-border bg-suya-lime-soft p-3 text-sm">
          <p className="font-semibold">Avisos de pedidos en Android</p>
          <p className="mt-1 text-suya-muted">
            {enabled ? 'Avisos activados para cambios de estado.' : 'Activa los avisos del sistema para tus pedidos.'}
          </p>
          {enabled === false && (
            <Button className="mt-2" size="sm" variant="secondary" disabled={requestingPermission} onClick={() => void enableNotifications()}>
              <Bell className="h-4 w-4" aria-hidden="true" />
              {permissionRequested ? 'Abrir ajustes' : 'Activar notificaciones'}
            </Button>
          )}
          {permissionError && <p role="status" className="mt-2 text-suya-muted">Revisa los permisos de Suya Delivery en los ajustes de Android.</p>}
        </div>
      )}
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
                  {event.storeName}{event.itemLabel ? ` · ${event.itemLabel}` : ''}
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
