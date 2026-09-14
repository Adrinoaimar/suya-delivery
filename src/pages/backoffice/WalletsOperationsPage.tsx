import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Eye, KeyRound, RefreshCw, Smartphone, WalletCards } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { cn } from '@/lib/cn';
import {
  notificationService,
  storeService,
  walletObserverService,
} from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime, formatPrice } from '@/utils/format';
import type { Store } from '@/types';
import type {
  CreatedWalletObserverDevice,
  WalletObservation,
  WalletObserverDevice,
  WalletPaymentCandidate,
  RestaurantPaymentAccount,
} from '@/lib/services';

const providerLabels: Record<string, string> = {
  yape: 'Yape',
  lemon: 'Lemon',
  plin: 'Plin',
  mercado_pago: 'Mercado Pago',
  mercado: 'Mercado Pago',
};

function providerLabel(value: string): string {
  return providerLabels[value.toLowerCase()] ?? value.replaceAll('_', ' ');
}

function normalizedPersonName(value: string | null): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function senderMatchesCustomer(senderName: string | null, customerName: string): boolean {
  const sender = normalizedPersonName(senderName);
  const customer = normalizedPersonName(customerName);
  return Boolean(sender && customer && sender === customer);
}

function observationStatus(value: string): { label: string; tone: 'neutral' | 'sun' | 'lime' } {
  if (/verified|confirmed|confirmado/i.test(value)) return { label: 'Verificado', tone: 'lime' };
  if (/pending|review/i.test(value)) return { label: 'En revisión', tone: 'sun' };
  return { label: 'Solo observación', tone: 'neutral' };
}

function dateLabel(value: string | null): string {
  if (!value) return 'Nunca conectado';
  try {
    return formatDateTime(value);
  } catch {
    return 'Fecha no disponible';
  }
}

export default function WalletsOperationsPage() {
  const identity = useAuthStore((state) => state.identity);
  const restaurantIds = useMemo(() => identity?.restaurantIds ?? [], [identity?.restaurantIds]);
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
  const [candidateObservationId, setCandidateObservationId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<WalletPaymentCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [verifyingAttemptId, setVerifyingAttemptId] = useState<string | null>(null);
  const [observationCodeId, setObservationCodeId] = useState<string | null>(null);
  const [observationCode, setObservationCode] = useState('');
  const [savingObservationCode, setSavingObservationCode] = useState(false);
  const [paymentAccounts, setPaymentAccounts] = useState<RestaurantPaymentAccount[]>([]);
  const [accountProvider, setAccountProvider] = useState<'yape' | 'lemon'>('yape');
  const [accountLabel, setAccountLabel] = useState('Cuenta principal');
  const [qrPayload, setQrPayload] = useState('');
  const [accountActive, setAccountActive] = useState(false);
  const loadRequestRef = useRef(0);
  const observationRequestRef = useRef(0);
  const candidateRequestRef = useRef(0);
  const canSelectRestaurant = isPlatformAdmin || restaurantIds.length > 1;
  const activeRestaurantId = restaurantId || (isPlatformAdmin ? '' : restaurantIds[0] ?? '');

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const observationRequestId = ++observationRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const allStores = await storeService.listStores();
      const visibleStores = allStores.filter(
        (store) => isPlatformAdmin || restaurantIds.includes(store.id),
      );
      const scopedRestaurantIds = visibleStores.map((store) => store.id);
      const [nextDevices, nextObservations] = await Promise.all([
        walletObserverService.listDevices(scopedRestaurantIds),
        walletObserverService.listObservations(scopedRestaurantIds),
      ]);
      if (
        requestId !== loadRequestRef.current ||
        observationRequestId !== observationRequestRef.current
      )
        return;
      setStores(visibleStores);
      setDevices(nextDevices);
      setObservations(nextObservations);
      if (isPlatformAdmin) {
        setRestaurantId((current) =>
          current && visibleStores.some((store) => store.id === current)
            ? current
            : visibleStores[0]?.id || '',
        );
      } else {
        setRestaurantId((current) =>
          current && restaurantIds.includes(current) ? current : restaurantIds[0] ?? '',
        );
      }
    } catch (cause) {
      if (requestId !== loadRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar las billeteras.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [isPlatformAdmin, restaurantIds]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (stores.length === 0) return;
    const refreshObservations = () => {
      if (document.visibilityState === 'hidden') return;
      const requestId = ++observationRequestRef.current;
      void walletObserverService
        .listObservations(stores.map((store) => store.id))
        .then((nextObservations) => {
          if (requestId === observationRequestRef.current) setObservations(nextObservations);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refreshObservations, 15_000);
    return () => window.clearInterval(timer);
  }, [stores]);

  useEffect(() => {
    if (!activeRestaurantId) {
      setPaymentAccounts([]);
      setAccountLabel('Cuenta principal');
      setQrPayload('');
      setAccountActive(false);
      return;
    }
    setPaymentAccounts([]);
    setAccountLabel('Cuenta principal');
    setQrPayload('');
    setAccountActive(false);
    let active = true;
    void walletObserverService
      .listPaymentAccounts(activeRestaurantId)
      .then((accounts) => {
        if (!active) return;
        setPaymentAccounts(accounts);
        const selected =
          accounts.find((account) => account.provider === accountProvider) ?? accounts[0];
        if (selected) {
          setAccountProvider(selected.provider);
          setAccountLabel(selected.accountLabel);
          setQrPayload(selected.qrPayload ?? '');
          setAccountActive(selected.active);
        }
      })
      .catch(() => {
        if (active) setPaymentAccounts([]);
      });
    return () => {
      active = false;
    };
  }, [activeRestaurantId, accountProvider]);

  const storeNames = useMemo(
    () => new Map(stores.map((store) => [store.id, store.name])),
    [stores],
  );

  const create = async () => {
    if (!activeRestaurantId || !label.trim()) {
      notificationService.notify(
        'Escribe un nombre para el dispositivo de esta cuenta.',
        'warning',
      );
      return;
    }
    setBusy(true);
    try {
      const created = await walletObserverService.createDevice(activeRestaurantId, label);
      setDevices((current) => [created, ...current]);
      setNewDevice(created);
      notificationService.notify(
        'Dispositivo creado. Abre la aplicación de caja en el teléfono receptor y pega el token.',
        'success',
      );
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos crear el dispositivo.',
        'danger',
      );
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

  const findCandidates = async (observationId: string) => {
    const requestId = ++candidateRequestRef.current;
    setCandidateObservationId(observationId);
    setCandidateLoading(true);
    setCandidates([]);
    try {
      const nextCandidates = await walletObserverService.listPaymentCandidates(observationId);
      if (requestId !== candidateRequestRef.current) return;
      setCandidates(nextCandidates);
    } catch (cause) {
      if (requestId !== candidateRequestRef.current) return;
      setCandidates([]);
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos buscar pedidos compatibles.',
        'danger',
      );
    } finally {
      if (requestId === candidateRequestRef.current) setCandidateLoading(false);
    }
  };

  const verifyCandidate = async (observationId: string, paymentAttemptId: string) => {
    setVerifyingAttemptId(paymentAttemptId);
    try {
      const verified = await walletObserverService.verifyObservation(
        observationId,
        paymentAttemptId,
      );
      if (!verified) throw new Error('El servidor no verificó la operación.');
      notificationService.notify('Pago verificado y vinculado al pedido.', 'success');
      setCandidateObservationId(null);
      setCandidates([]);
      await load();
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos verificar el pago.',
        'danger',
      );
    } finally {
      setVerifyingAttemptId(null);
    }
  };

  const saveObservationCode = async (observationId: string) => {
    if (!observationCode.trim()) {
      notificationService.notify('Escribe el código visible en la constancia.', 'warning');
      return;
    }
    setSavingObservationCode(true);
    try {
      const saved = await walletObserverService.setObservationCode(
        observationId,
        observationCode,
      );
      if (!saved) throw new Error('El servidor no guardó el código de operación.');
      setObservationCode('');
      setObservationCodeId(null);
      notificationService.notify('Código agregado. Buscando el pedido exacto…', 'success');
      await load();
      await findCandidates(observationId);
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos guardar el código observado.',
        'danger',
      );
    } finally {
      setSavingObservationCode(false);
    }
  };

  const selectAccountProvider = (provider: 'yape' | 'lemon') => {
    const selected = paymentAccounts.find((account) => account.provider === provider);
    setAccountProvider(provider);
    setAccountLabel(selected?.accountLabel ?? 'Cuenta principal');
    setQrPayload(selected?.qrPayload ?? '');
    setAccountActive(selected?.active ?? false);
  };

  const saveAccount = async () => {
    if (!activeRestaurantId || !accountLabel.trim()) {
      notificationService.notify('Selecciona la cuenta y escribe un nombre.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const saved = await walletObserverService.savePaymentAccount({
        restaurantId: activeRestaurantId,
        provider: accountProvider,
        accountLabel,
        qrPayload: qrPayload || null,
        active: accountActive,
      });
      setPaymentAccounts((current) => [
        ...current.filter((account) => account.provider !== saved.provider),
        saved,
      ]);
      notificationService.notify('Cuenta de pago guardada.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos guardar la cuenta de pago.',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  };

  if (error)
    return (
      <ErrorState
        title="No pudimos cargar dispositivos de pagos"
        description={error}
        onRetry={() => void load()}
      />
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-suya-green">
            Pagos observados
          </p>
          <h1 className="font-display text-2xl font-bold">Dispositivos de pagos</h1>
          <p className="mt-1 max-w-2xl text-sm text-suya-muted">
            Conecta el celular de caja que observa las notificaciones de Yape, Plin, Lemon y otras
            billeteras. Las nuevas observaciones aparecen automáticamente cada 15 segundos.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </div>

      <Card variant="glass" className="border-suya-green/20">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-suya-lime-soft p-3 text-suya-green">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold">Conecta un celular de caja</p>
            <p className="mt-1 text-sm text-suya-muted">
              Crea un dispositivo por restaurante y configura el observador de pagos en el celular
              de caja. Este dispositivo observa pagos; no es el celular del repartidor ni confirma
              pagos automáticamente.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {canSelectRestaurant ? (
            <label className="text-sm font-semibold">
              Cuenta de restaurante
              <select
                value={restaurantId}
                onChange={(event) => setRestaurantId(event.target.value)}
                className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-normal"
              >
                <option value="">Selecciona…</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-btn border border-suya-mist bg-[#F7FAF8] px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-suya-muted">
                Cuenta fijada
              </p>
              <p className="mt-1 text-sm font-semibold">
                {stores.find((store) => store.id === activeRestaurantId)?.name ??
                  'Restaurante pendiente de vincular'}
              </p>
            </div>
          )}
          <label className="text-sm font-semibold">
            Nombre del dispositivo
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void create();
              }}
              placeholder="Ej. Caja principal"
              className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal"
            />
          </label>
          <Button onClick={() => void create()} disabled={busy || loading || !activeRestaurantId}>
            <Smartphone className="h-4 w-4" />
            {busy ? 'Creando…' : 'Crear dispositivo'}
          </Button>
        </div>
      </Card>

      {newDevice && (
        <div role="status">
          <Card className="border-amber-300 bg-amber-50/80">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-amber-950">
                  Token generado · muéstralo solo ahora
                </p>
                <p className="mt-1 text-sm text-amber-900">
                  Guárdalo en el celular. Por seguridad, Suya no volverá a mostrar este token.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setNewDevice(null)}>
                Entendido
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-2 break-all rounded-btn border border-amber-300 bg-white p-3 font-mono text-xs">
              <span className="min-w-0 flex-1">{newDevice.deviceToken}</span>
              <button
                type="button"
                aria-label="Copiar token"
                className="shrink-0 rounded-lg p-2 text-amber-900 hover:bg-amber-100"
                onClick={() => void copyToken()}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </Card>
        </div>
      )}

      {activeRestaurantId && (
        <Card>
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-suya-lime-soft p-3 text-suya-green">
              <WalletCards className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Cuentas que verá el cliente</p>
              <p className="mt-1 text-sm text-suya-muted">
                Pega el contenido público del QR entregado por la billetera. No guardes claves,
                contraseñas ni códigos de seguridad aquí. El monto del pedido se muestra aparte y se
                valida en caja.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Billetera
              <select
                value={accountProvider}
                onChange={(event) => selectAccountProvider(event.target.value as 'yape' | 'lemon')}
                className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-normal"
              >
                <option value="yape">Yape</option>
                <option value="lemon">Lemon</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Nombre visible
              <input
                value={accountLabel}
                onChange={(event) => setAccountLabel(event.target.value)}
                className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal"
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Contenido público del QR (opcional)
              <textarea
                value={qrPayload}
                onChange={(event) => setQrPayload(event.target.value)}
                maxLength={4000}
                rows={3}
                placeholder="Pega aquí el texto o enlace público del QR del negocio"
                className="mt-1 w-full rounded-btn border border-suya-border px-3 py-2 font-mono text-xs font-normal"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={accountActive}
                onChange={(event) => setAccountActive(event.target.checked)}
              />
              Mostrar esta cuenta en el checkout
            </label>
            <Button type="button" onClick={() => void saveAccount()} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar cuenta'}
            </Button>
          </div>
        </Card>
      )}

      <section aria-labelledby="wallet-devices-title">
        <div className="mb-3 flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-suya-green" />
          <h2 id="wallet-devices-title" className="font-display text-lg font-bold">
            Dispositivos conectados
          </h2>
        </div>
        {loading ? (
          <Card role="status" className="p-8 text-center text-sm text-suya-muted">
            Cargando dispositivos conectados…
          </Card>
        ) : devices.length === 0 ? (
          <EmptyState
            icon={<Smartphone className="h-6 w-6" />}
            title="Aún no hay dispositivos"
            description="Crea uno para vincular el celular que recibe las notificaciones."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {devices.map((device) => (
              <Card key={device.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{device.label}</p>
                  <p className="mt-1 text-xs text-suya-muted">
                    {storeNames.get(device.restaurantId) ?? 'Restaurante'} ·{' '}
                    {dateLabel(device.lastSeenAt)}
                  </p>
                </div>
                <Badge tone={device.active ? 'lime' : 'neutral'}>
                  {device.active ? 'Activo' : 'Inactivo'}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="wallet-observations-title">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="h-5 w-5 text-suya-green" />
          <h2 id="wallet-observations-title" className="font-display text-lg font-bold">
            Últimas observaciones
          </h2>
        </div>
        {loading ? (
          <Card role="status" className="p-8 text-center text-sm text-suya-muted">
            Cargando observaciones…
          </Card>
        ) : observations.length === 0 ? (
          <EmptyState
            icon={<WalletCards className="h-6 w-6" />}
            title="Todavía no hay notificaciones detectadas"
            description="Cuando el celular reciba una notificación compatible, aparecerá aquí con nombre, código y monto."
          />
        ) : (
          <div className="overflow-hidden rounded-card border border-suya-border bg-white">
            <div className="divide-y divide-suya-mist">
              {observations.map((observation) => {
                const status = observationStatus(observation.verification);
                return (
                  <div
                    key={observation.id}
                    className="grid gap-2 px-4 py-3 sm:grid-cols-[1.4fr_1fr_auto_auto] sm:items-center"
                  >
                    <div>
                      <p className="font-semibold">
                        {observation.senderName ?? 'Nombre no disponible'}
                      </p>
                      <p className="text-xs text-suya-muted">
                        {providerLabel(observation.provider)} ·{' '}
                        {storeNames.get(observation.restaurantId) ?? 'Restaurante'} ·{' '}
                        {dateLabel(observation.observedAt)}
                      </p>
                    </div>
                    <p className="text-sm">
                      Código:{' '}
                      <span className="font-mono font-semibold">
                        {observation.codeLast4 ? `••••${observation.codeLast4}` : 'No disponible'}
                      </span>
                    </p>
                    <p className="font-display text-lg font-bold">
                      {formatPrice(observation.amountCents / 100)}{' '}
                      <span className="font-sans text-xs font-semibold text-suya-muted">
                        {observation.currency}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {(observation.provider === 'yape' || observation.provider === 'lemon') &&
                        observation.verification !== 'verified' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void findCandidates(observation.id)}
                            disabled={candidateLoading && candidateObservationId === observation.id}
                          >
                            {candidateLoading && candidateObservationId === observation.id
                              ? 'Buscando…'
                              : 'Buscar pedido'}
                          </Button>
                        )}
                    </div>
                    {observation.verification !== 'verified' && (
                      <div className="flex flex-wrap items-end gap-2 sm:col-span-4">
                        {observation.codeLast4 && observationCodeId !== observation.id ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setObservationCodeId(observation.id);
                              setObservationCode('');
                            }}
                          >
                            Agregar código completo
                          </Button>
                        ) : (
                          <>
                            <label className="min-w-52 flex-1 text-xs font-semibold text-suya-muted">
                              Código visible en la constancia
                              <input
                                value={observationCodeId === observation.id ? observationCode : ''}
                                onFocus={() => setObservationCodeId(observation.id)}
                                onChange={(event) => {
                                  setObservationCodeId(observation.id);
                                  setObservationCode(event.target.value);
                                }}
                                maxLength={64}
                                inputMode="text"
                                placeholder="Ej. 384 o 482913"
                                className="mt-1 h-10 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal"
                                disabled={savingObservationCode}
                              />
                            </label>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void saveObservationCode(observation.id)}
                              disabled={savingObservationCode || observationCodeId !== observation.id}
                            >
                              {savingObservationCode ? 'Guardando…' : 'Agregar código'}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    {candidateObservationId === observation.id && (
                      <div className="rounded-btn border border-suya-sun/60 bg-suya-sun-soft p-3 sm:col-span-4">
                        <p className="text-xs font-semibold uppercase tracking-[.14em] text-suya-muted">
                          Pedidos compatibles
                        </p>
                        {candidateLoading ? (
                          <p className="mt-2 text-sm text-suya-muted">
                            Comparando monto, billetera y ventana de tiempo…
                          </p>
                        ) : candidates.length === 0 ? (
                          <p className="mt-2 text-sm text-suya-muted">
                            No hay coincidencias exactas pendientes. No autorices esta fila
                            manualmente desde el cliente.
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {candidates.length > 1 && (
                              <p className="rounded-xl border border-suya-sun/60 bg-white p-2.5 text-sm text-suya-carbon">
                                Hay {candidates.length} pedidos compatibles. Agrega el código
                                completo de la constancia para identificar uno solo antes de
                                verificar.
                              </p>
                            )}
                            {candidates.map((candidate) => (
                              <div
                                key={candidate.paymentAttemptId}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-suya-border bg-white p-2.5 text-sm"
                              >
                                <div>
                                  <p className="font-semibold">
                                    Pedido #{candidate.orderCode} · {formatPrice(candidate.amount)}
                                  </p>
                                  <p className="text-xs text-suya-muted">
                                    Cliente: {candidate.customerName} · Referencia{' '}
                                    {candidate.checkoutReference} · Remitente:{' '}
                                    {candidate.senderName ?? 'no disponible'}
                                  </p>
                                  {candidate.senderName && (
                                    <p
                                      className={cn(
                                        'mt-1 text-xs font-semibold',
                                        senderMatchesCustomer(candidate.senderName, candidate.customerName)
                                          ? 'text-suya-green-dark'
                                          : 'text-suya-sun-dark',
                                      )}
                                    >
                                      {senderMatchesCustomer(candidate.senderName, candidate.customerName)
                                        ? 'Pista: el remitente coincide con el cliente.'
                                        : 'Pista: confirma el código completo antes de verificar.'}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    void verifyCandidate(observation.id, candidate.paymentAttemptId)
                                  }
                                  disabled={verifyingAttemptId !== null || candidates.length !== 1}
                                >
                                  {verifyingAttemptId === candidate.paymentAttemptId
                                    ? 'Verificando…'
                                    : 'Verificar pago'}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <Card className="flex items-start gap-3 bg-[#F7FAF8]">
        <Check className="mt-0.5 h-5 w-5 shrink-0 text-suya-green" />
        <p className="text-sm text-suya-muted">
          Estas filas son evidencia de una notificación observada. El estado “Solo observación” no
          reemplaza la confirmación oficial de la billetera ni marca un pedido como pagado.
        </p>
      </Card>
    </div>
  );
}
