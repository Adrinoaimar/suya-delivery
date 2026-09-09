import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Eye, KeyRound, RefreshCw, Smartphone, WalletCards } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { notificationService, storeService, walletObserverService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime, formatPrice } from '@/utils/format';
import type { Store } from '@/types';
import type { CreatedWalletObserverDevice, WalletObservation, WalletObserverDevice } from '@/lib/services';

const providerLabels: Record<string, string> = {
  yape: 'Yape',
  lemon: 'Lemon',
  plin: 'Plin',
  mercado_pago: 'Mercado Pago',
  mercado: 'Mercado Pago',
};

const EMPTY_RESTAURANT_IDS: string[] = [];

function providerLabel(value: string): string {
  return providerLabels[value.toLowerCase()] ?? value.replaceAll('_', ' ');
}

function observationStatus(value: string): { label: string; tone: 'neutral' | 'sun' | 'lime' } {
  if (/verified|confirmed|confirmado/i.test(value)) return { label: 'Verificado', tone: 'lime' };
  if (/pending|review/i.test(value)) return { label: 'En revisión', tone: 'sun' };
  return { label: 'Solo observación', tone: 'neutral' };
}

function dateLabel(value: string | null): string {
  if (!value) return 'Nunca conectado';
  try { return formatDateTime(value); } catch { return 'Fecha no disponible'; }
}

export default function WalletsOperationsPage() {
  const identity = useAuthStore((state) => state.identity);
  const restaurantIds = identity?.restaurantIds ?? EMPTY_RESTAURANT_IDS;
  const isPlatformAdmin = identity?.access.includes('platform_admin') ?? false;
  const [stores, setStores] = useState<Store[]>([]);
  const [devices, setDevices] = useState<WalletObserverDevice[]>([]);
  const [observations, setObservations] = useState<WalletObservation[]>([]);
  const [restaurantId, setRestaurantId] = useState('');
  const [label, setLabel] = useState('Caja principal');
  const [newDevice, setNewDevice] = useState<CreatedWalletObserverDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allStores = await storeService.listStores();
      const visibleStores = allStores.filter((store) => isPlatformAdmin || restaurantIds.includes(store.id));
      const scopedRestaurantIds = visibleStores.map((store) => store.id);
      const [nextDevices, nextObservations] = await Promise.all([
        walletObserverService.listDevices(scopedRestaurantIds),
        walletObserverService.listObservations(scopedRestaurantIds),
      ]);
      setStores(visibleStores);
      setDevices(nextDevices);
      setObservations(nextObservations);
      setRestaurantId((current) => current || restaurantIds[0] || visibleStores[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar las billeteras.');
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, restaurantIds]);

  useEffect(() => { void load(); }, [load]);

  const storeNames = useMemo(() => new Map(stores.map((store) => [store.id, store.name])), [stores]);

  const create = async () => {
    if (!restaurantId || !label.trim()) {
      notificationService.notify('Selecciona un restaurante y escribe un nombre para el dispositivo.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const created = await walletObserverService.createDevice(restaurantId, label);
      setDevices((current) => [created, ...current]);
      setNewDevice(created);
      notificationService.notify('Dispositivo creado. Guarda el token ahora.', 'success');
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No pudimos crear el dispositivo.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!newDevice) return;
    try {
      await navigator.clipboard.writeText(newDevice.deviceToken);
      notificationService.notify('Token copiado. Trátalo como una contraseña.', 'success');
    } catch {
      notificationService.notify('No pudimos copiar el token; cópialo manualmente.', 'warning');
    }
  };

  if (error) return <ErrorState title="No pudimos cargar billeteras" description={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-suya-green">Pagos observados</p>
          <h1 className="font-display text-2xl font-bold">Billeteras</h1>
          <p className="mt-1 max-w-2xl text-sm text-suya-muted">Conecta el celular de caja para recibir nombre, código y monto de las notificaciones de Yape, Plin, Lemon y otras billeteras.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" />Actualizar</Button>
      </div>

      <Card variant="glass" className="border-suya-green/20">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-suya-lime-soft p-3 text-suya-green"><KeyRound className="h-5 w-5" aria-hidden="true" /></div>
          <div><p className="font-semibold">Conecta un celular de caja</p><p className="mt-1 text-sm text-suya-muted">Crea un dispositivo por restaurante y pega su token en Suya Wallet Observer. La app móvil solo envía observaciones; no confirma pagos automáticamente.</p></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-semibold">Restaurante<select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)} className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-normal"><option value="">Selecciona…</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
          <label className="text-sm font-semibold">Nombre del dispositivo<input value={label} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void create(); }} placeholder="Ej. Caja principal" className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal" /></label>
          <Button onClick={() => void create()} disabled={busy || loading || !restaurantId}><Smartphone className="h-4 w-4" />{busy ? 'Creando…' : 'Crear dispositivo'}</Button>
        </div>
      </Card>

      {newDevice && <div role="status"><Card className="border-amber-300 bg-amber-50/80">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-amber-950">Token generado · muéstralo solo ahora</p><p className="mt-1 text-sm text-amber-900">Guárdalo en el celular. Por seguridad, Suya no volverá a mostrar este token.</p></div><Button variant="secondary" onClick={() => setNewDevice(null)}>Entendido</Button></div>
        <div className="mt-3 flex items-center gap-2 rounded-btn border border-amber-300 bg-white p-3 font-mono text-xs break-all"><span className="min-w-0 flex-1">{newDevice.deviceToken}</span><button type="button" aria-label="Copiar token" className="shrink-0 rounded-lg p-2 text-amber-900 hover:bg-amber-100" onClick={() => void copyToken()}><Copy className="h-4 w-4" /></button></div>
      </Card></div>}

      <section aria-labelledby="wallet-devices-title">
        <div className="mb-3 flex items-center gap-2"><Smartphone className="h-5 w-5 text-suya-green" /><h2 id="wallet-devices-title" className="font-display text-lg font-bold">Dispositivos conectados</h2></div>
        {!loading && devices.length === 0 ? <EmptyState icon={<Smartphone className="h-6 w-6" />} title="Aún no hay dispositivos" description="Crea uno para vincular el celular que recibe las notificaciones." /> : <div className="grid gap-3 sm:grid-cols-2">{devices.map((device) => <Card key={device.id} className="flex items-start justify-between gap-3"><div><p className="font-semibold">{device.label}</p><p className="mt-1 text-xs text-suya-muted">{storeNames.get(device.restaurantId) ?? 'Restaurante'} · {dateLabel(device.lastSeenAt)}</p></div><Badge tone={device.active ? 'lime' : 'neutral'}>{device.active ? 'Activo' : 'Inactivo'}</Badge></Card>)}</div>}
      </section>

      <section aria-labelledby="wallet-observations-title">
        <div className="mb-3 flex items-center gap-2"><Eye className="h-5 w-5 text-suya-green" /><h2 id="wallet-observations-title" className="font-display text-lg font-bold">Últimas observaciones</h2></div>
        {!loading && observations.length === 0 ? <EmptyState icon={<WalletCards className="h-6 w-6" />} title="Todavía no hay notificaciones detectadas" description="Cuando el celular reciba una notificación compatible, aparecerá aquí con nombre, código y monto." /> : <div className="overflow-hidden rounded-card border border-suya-border bg-white"><div className="divide-y divide-suya-mist">{observations.map((observation) => { const status = observationStatus(observation.verification); return <div key={observation.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1.4fr_1fr_auto_auto] sm:items-center"><div><p className="font-semibold">{observation.senderName ?? 'Nombre no disponible'}</p><p className="text-xs text-suya-muted">{providerLabel(observation.provider)} · {storeNames.get(observation.restaurantId) ?? 'Restaurante'} · {dateLabel(observation.observedAt)}</p></div><p className="text-sm">Código: <span className="font-mono font-semibold">{observation.codeLast4 ? `••••${observation.codeLast4}` : 'No disponible'}</span></p><p className="font-display text-lg font-bold">{formatPrice(observation.amountCents / 100)} <span className="text-xs font-sans font-semibold text-suya-muted">{observation.currency}</span></p><Badge tone={status.tone}>{status.label}</Badge></div>; })}</div></div>}
      </section>

      <Card className="flex items-start gap-3 bg-[#F7FAF8]"><Check className="mt-0.5 h-5 w-5 shrink-0 text-suya-green" /><p className="text-sm text-suya-muted">Estas filas son evidencia de una notificación observada. El estado “Solo observación” no reemplaza la confirmación oficial de la billetera ni marca un pedido como pagado.</p></Card>
    </div>
  );
}
