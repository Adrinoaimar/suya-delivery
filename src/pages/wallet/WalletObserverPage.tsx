import { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, KeyRound, LockKeyhole, RefreshCw, Settings2, Unplug } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
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
  return status.pendingEvents === 1 ? '1 evento pendiente' : `${status.pendingEvents} eventos pendientes`;
}

export default function WalletObserverPage() {
  const isAndroid = Capacitor.getPlatform() === 'android';
  const [status, setStatus] = useState<NativeWalletObserverStatus | null>(null);
  const [deviceToken, setDeviceToken] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!isAndroid) return;
    void nativeWalletObserver
      .getStatus()
      .then(setStatus)
      .catch(() => notificationService.notify('No pudimos leer el estado del dispositivo.', 'warning'));
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

  const configure = async () => {
    if (!deviceToken.trim()) {
      notificationService.notify('Pega el código de vinculación de esta caja.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const next = await nativeWalletObserver.configure(deviceToken.trim());
      setStatus(next);
      setDeviceToken('');
      notificationService.notify(
        next.notificationAccess
          ? 'Caja vinculada y lista para sincronizar.'
          : 'Caja vinculada. Activa el acceso a notificaciones para terminar.',
        next.notificationAccess ? 'success' : 'warning',
      );
    } catch (error) {
      notificationService.notify(error instanceof Error ? error.message : 'No pudimos vincular la caja.', 'danger');
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
    <main id="contenido" className="min-h-screen bg-suya-ivory px-4 py-8 text-suya-carbon sm:px-6">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <header className="rounded-card bg-suya-green p-5 text-white shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-suya-lime">Suya</p>
          <h1 className="mt-2 font-display text-2xl font-bold">Conexión de caja</h1>
          <p className="mt-2 text-sm text-white/80">
            Vincula este teléfono para mantener la evidencia de pagos sincronizada con operaciones.
          </p>
        </header>

        {!isAndroid && (
          <Card className="border-suya-sun/60 bg-suya-sun-soft">
            Esta conexión funciona únicamente en la aplicación Android de caja.
          </Card>
        )}

        <Card>
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-suya-lime-soft p-3 text-suya-green">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">Código de vinculación</h2>
              <p className="mt-1 text-sm text-suya-muted">
                Cópialo desde Dispositivos de pagos en Back Office. Se cifra en este teléfono y no vuelve a mostrarse.
              </p>
            </div>
          </div>
          <label className="mt-4 block text-sm font-semibold" htmlFor="device-token">
            Código de caja
            <input
              id="device-token"
              type="password"
              value={deviceToken}
              onChange={(event) => setDeviceToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={160}
              placeholder="Pega el código aquí"
              className="mt-1 h-12 w-full rounded-btn border border-suya-border bg-white px-3 font-mono text-xs outline-none focus:border-suya-green focus:ring-2 focus:ring-suya-green/20"
              disabled={!isAndroid || busy}
            />
          </label>
          <Button className="mt-3 w-full" onClick={() => void configure()} disabled={!isAndroid || busy || !deviceToken.trim()}>
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Guardando…' : 'Vincular teléfono'}
          </Button>
        </Card>

        <Card className="border-suya-green/20 bg-white">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-suya-lime-soft p-3 text-suya-green">
              {status?.notificationAccess ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <BellRing className="h-5 w-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Estado de sincronización</h2>
              <p className="mt-1 text-sm text-suya-muted">{statusLabel(status)}</p>
            </div>
          </div>
          {status?.configured && (
            <div className="mt-4 rounded-btn border border-suya-border bg-suya-ivory px-3 py-3 text-sm" role="status" aria-live="polite">
              <p className="font-semibold">{pendingEventsLabel(status)}</p>
              {status.queueFull && (
                <p className="mt-1 text-suya-danger">La cola está llena. Sincroniza antes de seguir capturando pagos.</p>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void nativeWalletObserver.openNotificationSettings()} disabled={!isAndroid || busy}>
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Abrir ajustes
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void sync()} disabled={!isAndroid || busy || !status?.configured}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Sincronizar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void clear()} disabled={!isAndroid || busy || !status?.configured}>
              <Unplug className="h-4 w-4" aria-hidden="true" />
              Desvincular
            </Button>
          </div>
        </Card>

        <p className="px-1 text-center text-xs text-suya-muted">
          La sincronización conserva evidencia mínima y nunca autoriza un pago automáticamente.
        </p>
      </div>
    </main>
  );
}
