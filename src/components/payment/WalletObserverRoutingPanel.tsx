import { useEffect, useState } from 'react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { notificationService, walletObserverService } from '@/lib/services';
import { PRELOADED_STATIC_QR_PRESETS } from '@/lib/payments/staticQrAutoCloud';
import { readQrImage } from '@/lib/payments/readQrImage';
import { formatDateTime } from '@/utils/format';
import type {
  RestaurantPaymentAccount,
  WalletObserverDevice,
  WalletObserverRoute,
  WalletObserverRouteAction,
} from '@/lib/services';

const slots = ['Adriano', 'Jean', 'Reserva'];
const health: Record<string, string> = {
  missing_qr: 'Falta QR',
  unpaired: 'Falta emparejar Suya Caja',
  device_paused: 'Dispositivo pausado',
  offline: 'Sin señal reciente',
  listener_unavailable: 'Lector de notificaciones desconectado',
  wallet_unavailable: 'Billetera o notificaciones deshabilitadas',
  sync_pending: 'Sincronizando abonos',
  needs_test: 'Pendiente de prueba',
  paused: 'Pausada',
  ready: 'Disponible',
};
const input = 'mt-1 min-h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm';

function RouteFields({
  route,
  account,
  busy,
  commit,
}: {
  route: WalletObserverRoute;
  account?: RestaurantPaymentAccount;
  busy: boolean;
  commit: (action: WalletObserverRouteAction) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [recipient, setRecipient] = useState(route.recipient ?? '');
  const [qrPayload, setQrPayload] = useState(route.qrPayload ?? '');
  const [tested, setTested] = useState(false);
  const provider = route.provider === 'yape' ? 'Yape' : 'Lemon';
  const field = `${provider} de ${slots[route.priority - 1]}`;

  return (
    <div className="min-w-0 space-y-2 rounded-btn border border-suya-border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="font-semibold">{provider}</p>
        <Badge tone={route.health === 'ready' ? 'lime' : 'neutral'}>
          {health[route.health] ?? 'Sin estado'}
        </Badge>
      </div>
      {route.recipient && <p className="break-words text-sm text-suya-muted">{route.recipient}</p>}
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await commit({
                kind: 'save',
                priority: route.priority,
                provider: route.provider,
                recipient,
                qrPayload,
              })
            ) {
              setEditing(false);
            }
          }}
        >
          <label className="block text-xs font-semibold">
            Destinatario · {field}
            <input
              required
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              maxLength={120}
              className={input}
            />
          </label>
          <label className="block text-xs font-semibold">
            Imagen del QR · {field}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className={`${input} py-2`}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                try {
                  const raw = await readQrImage(file);
                  if (raw.length < 12 || raw.length > 2000)
                    throw new Error('No pudimos leer un QR compatible.');
                  setQrPayload(raw);
                } catch (cause) {
                  notificationService.notify(
                    cause instanceof Error ? cause.message : 'No pudimos leer el QR.',
                    'warning',
                  );
                }
              }}
            />
          </label>
          <label className="block text-xs font-semibold">
            Contenido del QR · {field}
            <textarea
              rows={2}
              required
              value={qrPayload}
              onChange={(event) => setQrPayload(event.target.value)}
              maxLength={2000}
              className={`${input} break-all py-2`}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={busy}>
              Guardar QR
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            {route.priority === 1 && (
              <Button
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => {
                  const preset = PRELOADED_STATIC_QR_PRESETS[route.provider];
                  setRecipient(preset.receiverLabel);
                  setQrPayload(preset.qrPayload);
                }}
              >
                Usar QR de Adriano
              </Button>
            )}
            {account?.qrPayload && (
              <Button
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => {
                  setRecipient(account.accountLabel);
                  setQrPayload(account.qrPayload ?? '');
                }}
              >
                Usar QR registrado
              </Button>
            )}
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => {
            setRecipient(route.recipient ?? '');
            setQrPayload(route.qrPayload ?? '');
            setEditing(true);
          }}
        >
          {route.version ? 'Editar QR' : 'Cargar QR'}
        </Button>
      )}
      {route.version &&
        !editing &&
        (route.enabled ? (
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={() => void commit({ kind: 'enable', route, enabled: false })}
          >
            Pausar billetera
          </Button>
        ) : (
          <div className="space-y-2 pt-1">
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={tested}
                onChange={(event) => setTested(event.target.checked)}
              />
              Verifiqué el QR y recibí un abono de prueba en esta billetera.
            </label>
            <Button
              size="sm"
              type="button"
              disabled={busy || !tested || !['needs_test', 'paused'].includes(route.health)}
              onClick={async () => {
                if (await commit({ kind: 'enable', route, enabled: true })) setTested(false);
              }}
            >
              Habilitar billetera
            </Button>
          </div>
        ))}
    </div>
  );
}

export function WalletObserverRoutingPanel({
  restaurantId,
  accounts,
  devices,
  onDevicesChanged,
}: {
  restaurantId: string;
  accounts: RestaurantPaymentAccount[];
  devices: WalletObserverDevice[];
  onDevicesChanged: () => void;
}) {
  const [routes, setRoutes] = useState<WalletObserverRoute[]>([]);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; priority: number } | null>(null);

  useEffect(() => {
    if (!walletObserverService.listObserverRoutes) return;
    let active = true;
    const reload = () =>
      void walletObserverService
        .listObserverRoutes?.(restaurantId)
        .then((current) => {
          if (active) {
            setRoutes(current);
            setUnavailable(false);
          }
        })
        .catch(() => {
          if (active) setUnavailable(true);
        });
    reload();
    const timer = window.setInterval(reload, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [restaurantId]);

  async function commit(action: WalletObserverRouteAction): Promise<boolean> {
    if (busy || !walletObserverService.changeObserverRoute) return false;
    setBusy(true);
    try {
      const code = await walletObserverService.changeObserverRoute(restaurantId, action);
      if (action.kind === 'pair' && code) setPairing({ code, priority: action.priority });
      const current = await walletObserverService.listObserverRoutes?.(restaurantId);
      if (current) setRoutes(current);
      return true;
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos guardar el cambio.',
        'danger',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (unavailable)
    return (
      <p className="text-sm text-suya-muted" role="status">
        No pudimos consultar los puestos de cobro.
      </p>
    );
  if (!routes.length) return null;
  const checkoutEnabled = routes[0].checkoutEnabled;

  return (
    <Card className="space-y-4" aria-labelledby="observer-routing-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="observer-routing-title" className="font-display text-lg font-bold">
            Puestos de cobro
          </h2>
          <p className="text-sm text-suya-muted">
            {checkoutEnabled
              ? 'Asignación automática activa'
              : 'Configuración previa a la activación'}
          </p>
        </div>
        <Button
          type="button"
          variant={checkoutEnabled ? 'secondary' : 'primary'}
          disabled={busy || (!checkoutEnabled && !routes.some((route) => route.health === 'ready'))}
          onClick={() => void commit({ kind: 'checkout', enabled: !checkoutEnabled })}
        >
          {checkoutEnabled ? 'Desactivar asignación' : 'Activar asignación'}
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Disponibilidad de cobro">
        {(['yape', 'lemon'] as const).map((provider) => {
          const available = routes.find((route) => route.provider === provider && route.health === 'ready');
          return (
            <li key={provider} className="flex items-center justify-between gap-2 rounded-btn border border-suya-mist px-3 py-2.5">
              <span className="font-semibold">{provider === 'yape' ? 'Yape' : 'Lemon'}</span>
              <Badge tone={checkoutEnabled && available ? 'lime' : 'neutral'}>
                {checkoutEnabled ? (available ? slots[available.priority - 1] : 'Sin puesto disponible') : 'Asignación desactivada'}
              </Badge>
            </li>
          );
        })}
      </ul>
      <details className="space-y-3">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-suya-green">
          Configurar puestos de cobro
        </summary>
      {slots.map((label, index) => {
        const priority = index + 1;
        const wallets = routes.filter((route) => route.priority === priority);
        const slot = wallets[0];
        const assignedElsewhere = new Set(
          routes.filter((route) => route.priority !== priority).map((route) => route.deviceId),
        );
        return (
          <section
            key={label}
            className="space-y-3 rounded-card border border-suya-border bg-suya-ivory p-3"
            aria-label={label}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold">{label}</h3>
                <p className="text-xs text-suya-muted">
                  {slot?.heartbeatAt
                    ? `Señal ${formatDateTime(slot.heartbeatAt)}`
                    : 'Sin señal registrada'}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void commit({ kind: 'pair', priority, label })}
              >
                Emparejar Suya Caja
              </Button>
            </div>
            {pairing?.priority === priority && (
              <p className="rounded-btn bg-white p-3 text-sm" role="status">
                Escribe <strong className="font-mono tracking-widest">{pairing.code}</strong> en
                Suya Caja dentro de 10 minutos.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 grow text-xs font-semibold">
                Dispositivo asignado
                <select
                  className={input}
                  aria-label={`Dispositivo asignado a ${label}`}
                  disabled={busy}
                  value={slot?.deviceId ?? ''}
                  onChange={(event) =>
                    void commit({ kind: 'bind', priority, deviceId: event.target.value })
                  }
                >
                  <option value="" disabled>
                    Elegir dispositivo
                  </option>
                  {slot?.deviceId && !devices.some((device) => device.id === slot.deviceId) && (
                    <option value={slot.deviceId}>Emparejado</option>
                  )}
                  {devices
                    .filter(
                      (device) =>
                        device.id === slot?.deviceId ||
                        (device.active && !assignedElsewhere.has(device.id)),
                    )
                    .map((device) => (
                      <option value={device.id} key={device.id}>
                        {device.label}
                      </option>
                    ))}
                </select>
              </label>
              {slot?.deviceId && walletObserverService.setDeviceAutoSettle && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!slot.deviceId || !walletObserverService.setDeviceAutoSettle) return;
                    setBusy(true);
                    try {
                      const saved = await walletObserverService.setDeviceAutoSettle(
                        slot.deviceId,
                        !slot.autoSettle,
                      );
                      if (!saved) throw new Error('No pudimos guardar la auto-confirmación.');
                      const current =
                        await walletObserverService.listObserverRoutes?.(restaurantId);
                      if (current) setRoutes(current);
                      onDevicesChanged();
                    } catch {
                      notificationService.notify(
                        'No pudimos guardar la auto-confirmación.',
                        'danger',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {slot.autoSettle ? 'Pausar auto-confirmación' : 'Activar auto-confirmación'}
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {wallets.map((route) => (
                <RouteFields
                  key={route.provider}
                  route={route}
                  busy={busy}
                  commit={commit}
                  account={
                    priority === 1
                      ? accounts.find((account) => account.provider === route.provider)
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
      </details>
    </Card>
  );
}
