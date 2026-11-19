import { useCallback, useEffect, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Settings2,
  Unplug,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { LogoMark } from '@/components/common/Logo';
import { notificationService, nativeWalletObserver } from '@/lib/services';
import type { NativeWalletObserverStatus } from '@/lib/services/NativeWalletObserverService';

function statusLabel(status: NativeWalletObserverStatus | null): string {
  if (!status?.configured) return 'Sin vincular';
  return status.notificationAccess ? 'Listo para sincronizar' : 'Falta activar notificaciones';
}

function pendingEventsLabel(status: NativeWalletObserverStatus): string {
  if (!Number.isInteger(status.pendingEvents) || (status.pendingEvents ?? 0) < 0) {
    return 'Eventos pendientes: no disponible';
  }
  return status.pendingEvents === 1
    ? '1 evento pendiente'
    : `${status.pendingEvents} eventos pendientes`;
}

function yapeResultLabel(result: string | null | undefined): string {
  const labels: Record<string, string> = {
    checking_notification: 'Notificación Yape recibida; revisando campos',
    device_unpaired: 'El teléfono recibió una notificación, pero no está vinculado',
    notification_empty: 'Android entregó una notificación sin contenido',
    notification_text_empty: 'Android no expuso el texto de la notificación',
    wallet_marker_missing: 'No se reconoció la billetera en el texto',
    incoming_marker_missing: 'El texto no indicó un pago recibido reconocido',
    amount_missing: 'No se encontró el monto',
    amount_malformed: 'El formato del monto no se reconoció',
    currency_unrecognized: 'La moneda no coincide con una billetera admitida',
    recognized_missing_code_and_sender: 'Notificación reconocida; faltaron código y nombre',
    recognized_missing_code: 'Notificación reconocida; faltó el código de seguridad',
    recognized_missing_sender: 'Notificación reconocida; faltó el nombre del pagador',
    recognized_complete: 'Notificación reconocida con nombre y código disponibles',
  };
  return result ? labels[result] ?? 'Resultado de lectura no reconocido' : 'Aún no llegó una notificación Yape al listener';
}

function yapeAtLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(date);
}

export default function WalletObserverPage() {
  const isAndroid = Capacitor.getPlatform() === 'android';
  const [status, setStatus] = useState<NativeWalletObserverStatus | null>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [busy, setBusy] = useState(false);
  const slot = status?.slot ? ['Adriano', 'Jean', 'Reserva'][status.slot - 1] : null;
  const pairingReady = slot ? /^[A-F0-9]{16}$/.test(pairingCode) : /^(?:[A-F0-9]{8}|[A-F0-9]{16})$/.test(pairingCode);

  const refresh = useCallback(() => {
    if (!isAndroid) return;
    void nativeWalletObserver
      .getStatus()
      .then(setStatus)
      .catch(() =>
        notificationService.notify('No pudimos leer el estado del dispositivo.', 'warning'),
      );
  }, [isAndroid]);

  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refresh]);

  const pair = async () => {
    const normalizedCode = pairingCode.trim().toUpperCase();
    if (!pairingReady) {
      notificationService.notify(slot ? `Escribe el código de 16 caracteres de ${slot}.` : 'Escribe el código de emparejamiento.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const next = await nativeWalletObserver.pair(normalizedCode);
      setStatus(next);
      setPairingCode('');
      notificationService.notify(
        next.notificationAccess
          ? 'Caja emparejada y lista para sincronizar.'
          : 'Caja emparejada. Activa el acceso a notificaciones para terminar.',
        next.notificationAccess ? 'success' : 'warning',
      );
    } catch (error) {
      notificationService.notify(
        error instanceof Error ? error.message : 'No pudimos emparejar la caja.',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      setStatus(await nativeWalletObserver.sync());
      notificationService.notify('Sincronización solicitada.', 'success');
    } catch {
      notificationService.notify('No pudimos sincronizar todavía.', 'warning');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      setStatus(await nativeWalletObserver.clear());
      notificationService.notify('Vinculación eliminada de este teléfono.', 'success');
    } catch {
      notificationService.notify('No pudimos eliminar la vinculación.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="contenido" className="min-h-dvh bg-suya-ivory px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))] text-suya-carbon sm:px-6">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <header className="motion-fade rounded-card bg-suya-green-dark p-5 text-white">
          <div className="flex items-center gap-2.5">
            <LogoMark tone="onDark" className="h-9 w-9 shrink-0" />
            <h1 className="font-display text-2xl font-bold">{slot ? `Suya Caja · ${slot}` : 'Suya Caja'}</h1>
          </div>
          <p className="mt-2 text-sm text-white/90">
            {status?.configured && status.notificationAccess ? 'Acceso a notificaciones activado.'
              : 'Vincula el teléfono y activa el acceso a notificaciones.'}
          </p>
        </header>

        {!isAndroid && (
          <Card className="border-suya-sun/60 bg-suya-sun-soft">
            Esta conexión funciona únicamente en la aplicación Android de caja.
          </Card>
        )}

        {!status?.configured && <Card>
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-suya-lime-soft p-3 text-suya-green">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">Emparejamiento de caja</h2>
              <p className="mt-1 text-sm text-suya-muted">
                Genera el código de un solo uso en Suya Empresas, en Dispositivos de pagos.
              </p>
            </div>
          </div>
          <label className="mt-4 block text-sm font-semibold" htmlFor="pairing-code">
            Código de emparejamiento
            <input
              id="pairing-code"
              type="text"
              value={pairingCode}
              onChange={(event) =>
                setPairingCode(
                  event.target.value
                    .replace(/[^a-fA-F0-9]/g, '')
                    .slice(0, 16)
                    .toUpperCase(),
                )
              }
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              maxLength={16}
              pattern="(?:[A-Fa-f0-9]{8}|[A-Fa-f0-9]{16})"
              placeholder={slot ? 'Código de 16 caracteres' : 'Código de Caja'}
              className="mt-1 h-12 w-full rounded-btn border border-suya-border bg-white px-3 font-mono text-xs outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
              disabled={!isAndroid || busy}
            />
          </label>
          <Button
            className="mt-3 w-full"
            onClick={() => void pair()}
            disabled={!isAndroid || busy || !pairingReady}
          >
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Emparejando…' : 'Emparejar teléfono'}
          </Button>
        </Card>}

        <Card className="border-suya-green/20 bg-white">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-suya-lime-soft p-3 text-suya-green">
              {status?.notificationAccess ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <BellRing className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Estado de sincronización</h2>
              <p className="mt-1 text-sm text-suya-muted">{statusLabel(status)}</p>
            </div>
          </div>
          {status?.configured && (
            <div
              className="mt-4 rounded-btn border border-suya-border bg-suya-ivory px-3 py-3 text-sm"
              role="status"
              aria-live="polite"
            >
              <p className="font-semibold">{pendingEventsLabel(status)}</p>
              <p className="mt-2">Notificaciones Yape recibidas: {status.yapeNotificationsSeen ?? 0}</p>
              <p className="mt-1">Último resultado: {yapeResultLabel(status.lastYapeResult)}</p>
              {yapeAtLabel(status.lastYapeAt) && (
                <p className="mt-1 text-xs text-suya-muted">Última lectura: {yapeAtLabel(status.lastYapeAt)}</p>
              )}
              {(status.rejectedEvents ?? 0) > 0 && (
                <p className="mt-1 text-suya-danger">
                  Observaciones rechazadas: {status.rejectedEvents}. Revisa esos abonos en la billetera.
                </p>
              )}
              {status.queueFull && (
                <p className="mt-1 text-suya-danger">
                  La cola está llena. Sincroniza antes de seguir capturando pagos.
                </p>
              )}
            </div>
          )}
          {status?.configured && status.batteryUnrestricted === false && (
            <p className="mt-3 text-sm text-suya-muted">
              En un teléfono dedicado a Caja, permite el uso de batería sin restricciones para
              reducir las pausas de Android cuando la pantalla esté apagada.
              <Button variant="ghost" size="sm" className="mt-1 min-h-11" onClick={() =>
                void nativeWalletObserver.openBatterySettings().catch(() =>
                  notificationService.notify('Revisa el uso de batería de Suya Caja en los ajustes de Android.', 'info'),
                )
              }>
                Ajustes de batería
              </Button>
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void nativeWalletObserver.openNotificationSettings()}
              disabled={!isAndroid || busy}
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Abrir ajustes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void sync()}
              disabled={!isAndroid || busy || !status?.configured}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Sincronizar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void clear()}
              disabled={!isAndroid || busy || !status?.configured}
            >
              <Unplug className="h-4 w-4" aria-hidden="true" />
              Desvincular
            </Button>
          </div>
        </Card>

        <Card className="border-suya-sun/60 bg-suya-sun-soft text-sm">
          Si Android oculta el código de Yape, revisa el abono desde Dispositivos de pagos
          en Suya Empresas.
        </Card>

        <p className="px-1 text-center text-xs text-suya-muted">
          Suya Caja reporta el abono. El servidor verifica el pago y actualiza el pedido.
        </p>
      </div>
    </main>
  );
}
