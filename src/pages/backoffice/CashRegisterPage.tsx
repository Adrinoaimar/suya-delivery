import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, ClipboardCheck, Plus, RefreshCw, Scale } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { cashRegisterService, notificationService, storeService, tableService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { useBackofficeContextStore } from '@/store/backofficeContextStore';
import { useOrderStore } from '@/store/orderStore';
import type { CashRegisterSession, TableSummary } from '@/lib/services';
import type { Store } from '@/types';
import { formatDateTime, formatPrice } from '@/utils/format';

function requestId(): string {
  return crypto.randomUUID();
}

function amountInput(value: string): number | null {
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function sessionLabel(session: CashRegisterSession): string {
  return session.status === 'open' ? 'Turno abierto' : 'Turno cerrado';
}

export default function CashRegisterPage() {
  const identity = useAuthStore((state) => state.identity);
  const restaurantIds = useMemo(() => identity?.restaurantIds ?? [], [identity?.restaurantIds]);
  const isPlatformAdmin = identity?.access.includes('platform_admin') ?? false;
  const contextRestaurantId = useBackofficeContextStore((state) => state.activeRestaurantId);
  const setContextRestaurantId = useBackofficeContextStore((state) => state.setActiveRestaurantId);
  const orders = useOrderStore((state) => state.orders);
  const refreshOrders = useOrderStore((state) => state.refresh);
  const [stores, setStores] = useState<Store[]>([]);
  const [sessions, setSessions] = useState<CashRegisterSession[]>([]);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [openingFloat, setOpeningFloat] = useState('0');
  const [declaredCash, setDeclaredCash] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [cashReceived, setCashReceived] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const activeRestaurantId = contextRestaurantId || (isPlatformAdmin ? '' : restaurantIds[0] ?? '');
  const canSelectRestaurant = isPlatformAdmin || restaurantIds.length > 1;

  const load = useCallback(async (preferredRestaurantId = '') => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const allStores = await storeService.listStores();
      const visibleStores = allStores.filter(
        (store) => isPlatformAdmin || restaurantIds.includes(store.id),
      );
      const currentContext = useBackofficeContextStore.getState().activeRestaurantId;
      const requestedRestaurantId = preferredRestaurantId || currentContext;
      const nextRestaurantId = requestedRestaurantId &&
        visibleStores.some((store) => store.id === requestedRestaurantId)
        ? requestedRestaurantId
        : visibleStores[0]?.id ?? '';
      if (requestId !== loadRequestRef.current) return;

      // Fijar la cuenta antes de las consultas secundarias evita mostrar un
      // selector vacío y mantiene el alcance visible durante una respuesta lenta.
      setStores(visibleStores);
      setContextRestaurantId(nextRestaurantId);
      const restaurantScope = visibleStores.map((store) => store.id);
      const [rows, tableRows] = await Promise.all([
        cashRegisterService.list(restaurantScope),
        tableService.list(restaurantScope),
      ]);
      if (requestId !== loadRequestRef.current) return;
      setSessions(rows);
      setTables(tableRows);
    } catch (cause) {
      if (requestId !== loadRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar la caja.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [isPlatformAdmin, restaurantIds, setContextRestaurantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentSession = useMemo(
    () => sessions.find(
      (session) => session.restaurantId === activeRestaurantId && session.status === 'open',
    ) ?? null,
    [activeRestaurantId, sessions],
  );
  const visibleHistory = useMemo(
    () => sessions.filter((session) => session.restaurantId === activeRestaurantId && session.status === 'closed'),
    [activeRestaurantId, sessions],
  );
  const pendingCashOrders = useMemo(
    () => orders.filter((order) =>
      order.storeId === activeRestaurantId &&
      order.paymentMethod === 'cash' &&
      order.status === 'delivered' &&
      !order.cashRegisterSessionId,
    ),
    [activeRestaurantId, orders],
  );
  const pendingTablePayments = useMemo(
    () => tables.filter((table) =>
      table.restaurantId === activeRestaurantId &&
      table.status === 'awaiting_payment' &&
      table.sessionId &&
      table.total > 0,
    ),
    [activeRestaurantId, tables],
  );
  const selectedStore = stores.find((store) => store.id === activeRestaurantId);

  async function reload() {
    setBusy('reload');
    setError(null);
    try {
      await load(activeRestaurantId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar la caja.');
    } finally {
      setBusy(null);
    }
  }

  async function open() {
    if (!activeRestaurantId) {
      notificationService.notify('Selecciona una cuenta de restaurante.', 'warning');
      return;
    }
    const amount = amountInput(openingFloat);
    if (amount === null) {
      notificationService.notify('Escribe un fondo inicial válido.', 'warning');
      return;
    }
    setBusy('open');
    try {
      const session = await cashRegisterService.open(activeRestaurantId, amount, requestId());
      setSessions((current) => [session, ...current.filter((row) => row.id !== session.id)]);
      notificationService.notify('Turno de caja abierto.', 'success');
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No pudimos abrir la caja.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function recordSale(orderId: string, total: number) {
    if (!currentSession) return;
    const received = amountInput(cashReceived[orderId] ?? total.toFixed(2));
    if (received === null || received < total) {
      notificationService.notify('El efectivo recibido no puede ser menor que el total.', 'warning');
      return;
    }
    setBusy(`sale:${orderId}`);
    try {
      await cashRegisterService.recordSale(currentSession.id, orderId, received, requestId());
      setCashReceived((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
      await Promise.all([load(activeRestaurantId), refreshOrders()]);
      notificationService.notify('Cobro registrado en el turno.', 'success');
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No pudimos registrar el cobro.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function recordTablePayment(table: TableSummary) {
    if (!currentSession || !table.sessionId) return;
    const received = amountInput(cashReceived[`table:${table.sessionId}`] ?? table.total.toFixed(2));
    if (received === null || received < table.total) {
      notificationService.notify('El efectivo recibido no puede ser menor que el total de la mesa.', 'warning');
      return;
    }
    setBusy(`table:${table.sessionId}`);
    try {
      await tableService.pay(table.sessionId, received, 'cash', requestId());
      setCashReceived((current) => {
        const next = { ...current };
        delete next[`table:${table.sessionId}`];
        return next;
      });
      await load(activeRestaurantId);
      notificationService.notify('Cobro de mesa registrado en el turno.', 'success');
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No pudimos registrar el cobro de mesa.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function addAdjustment() {
    if (!currentSession) return;
    const amount = Number(adjustmentAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount === 0 || adjustmentNote.trim().length < 3) {
      notificationService.notify('Indica un ajuste distinto de cero y explica el motivo.', 'warning');
      return;
    }
    setBusy('adjustment');
    try {
      await cashRegisterService.addAdjustment(currentSession.id, amount, adjustmentNote, requestId());
      setAdjustmentAmount('');
      setAdjustmentNote('');
      await load(activeRestaurantId);
      notificationService.notify('Ajuste guardado en el libro de caja.', 'success');
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No pudimos guardar el ajuste.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    if (!currentSession) return;
    const amount = amountInput(declaredCash);
    if (amount === null) {
      notificationService.notify('Escribe el efectivo contado.', 'warning');
      return;
    }
    const difference = Math.round((amount - currentSession.expectedCash) * 100) / 100;
    if (difference !== 0 && closeNote.trim().length < 3) {
      notificationService.notify('Explica la diferencia antes de cerrar la caja.', 'warning');
      return;
    }
    setBusy('close');
    try {
      await cashRegisterService.close(currentSession.id, amount, closeNote, requestId());
      setDeclaredCash('');
      setCloseNote('');
      await load(activeRestaurantId);
      notificationService.notify('Turno cerrado y arqueo guardado.', 'success');
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No pudimos cerrar la caja.', 'danger');
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState description={error} onRetry={() => void reload()} />;
  if (loading && stores.length === 0) {
    return <p role="status" className="text-sm text-suya-muted">Cargando cierre de caja…</p>;
  }
  if (stores.length === 0) {
    return (
      <EmptyState
        icon={<Banknote className="h-6 w-6" />}
        title="No hay una cuenta de restaurante"
        description="La caja solo está disponible para una cuenta autorizada y activa."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-suya-green">Operaciones</p>
          <h1 className="font-display text-2xl font-bold">Cierre de caja</h1>
          <p className="mt-1 text-sm text-suya-muted">Apertura, cobros en efectivo, ajustes y arqueo auditable por turno.</p>
        </div>
        <Button variant="secondary" onClick={() => void reload()} disabled={busy === 'reload'}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Actualizar
        </Button>
      </div>

      <Card className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        {canSelectRestaurant ? (
          <label className="text-sm font-semibold">
            Cuenta de restaurante
            <select
              aria-label="Cuenta de restaurante"
              value={activeRestaurantId}
              onChange={(event) => {
                setContextRestaurantId(event.target.value);
                void load(event.target.value);
              }}
              className="mt-1 h-11 w-full rounded-btn border border-[#CDD4D0] bg-white px-3 font-normal"
            >
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
        ) : (
          <div className="rounded-btn border border-suya-mist bg-[#F7FAF8] px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-suya-muted">Cuenta fijada</p>
            <p className="mt-1 text-sm font-semibold">{selectedStore?.name ?? 'Restaurante pendiente de vincular'}</p>
          </div>
        )}
        <p className="text-sm text-suya-muted">Los saldos se calculan en el servidor.</p>
      </Card>

      {!currentSession ? (
        <Card className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Banknote className="h-5 w-5 text-suya-green" aria-hidden="true" />Abrir turno</h2>
            <p className="mt-1 text-sm text-suya-muted">Registra el fondo inicial antes de aceptar efectivo en caja.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="text-sm font-semibold">
              Fondo inicial (S/)
              <input
                aria-label="Fondo inicial"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                value={openingFloat}
                onChange={(event) => setOpeningFloat(event.target.value)}
                className="mt-1 h-11 w-full rounded-btn border border-[#CDD4D0] px-3 font-normal"
              />
            </label>
            <Button onClick={() => void open()} disabled={busy === 'open'}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Abrir caja
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-suya-green">{sessionLabel(currentSession)}</p>
                <h2 className="mt-1 font-display text-xl font-bold">{selectedStore?.name}</h2>
                <p className="text-sm text-suya-muted">Abierta {formatDateTime(currentSession.openedAt)}</p>
              </div>
              <span className="rounded-full bg-suya-lime/25 px-3 py-1 text-sm font-semibold text-suya-green-dark">En operación</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-btn bg-suya-mist/45 p-3"><p className="text-xs text-suya-muted">Fondo inicial</p><p className="font-display text-lg font-bold">{formatPrice(currentSession.openingFloat)}</p></div>
              <div className="rounded-btn bg-suya-mist/45 p-3"><p className="text-xs text-suya-muted">Saldo esperado</p><p className="font-display text-lg font-bold">{formatPrice(currentSession.expectedCash)}</p></div>
              <div className="rounded-btn bg-suya-mist/45 p-3"><p className="text-xs text-suya-muted">Movimientos</p><p className="font-display text-lg font-bold">{currentSession.entryCount}</p></div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold"><ClipboardCheck className="h-5 w-5 text-suya-green" aria-hidden="true" />Cobros pendientes de registrar</h2>
              <p className="mt-1 text-sm text-suya-muted">Solo aparecen pedidos en efectivo ya entregados y aún no vinculados a un turno.</p>
            </div>
            {pendingCashOrders.length === 0 ? (
              <p className="rounded-btn border border-dashed border-suya-mist p-4 text-sm text-suya-muted">No hay cobros de efectivo pendientes.</p>
            ) : (
              <div className="space-y-3">
                {pendingCashOrders.map((order) => (
                  <div key={order.id} className="grid gap-3 rounded-btn border border-suya-mist p-3 sm:grid-cols-[1fr_170px_auto] sm:items-end">
                    <div>
                      <p className="font-semibold">#{order.code} · {order.customer.name}</p>
                      <p className="text-sm text-suya-muted">Total canónico: {formatPrice(order.total)}</p>
                    </div>
                    <label className="text-sm font-semibold">
                      Recibido (S/)
                      <input
                        aria-label={`Efectivo recibido para ${order.code}`}
                        inputMode="decimal"
                        min={order.total}
                        step="0.01"
                        type="number"
                        value={cashReceived[order.id] ?? order.total.toFixed(2)}
                        onChange={(event) => setCashReceived((current) => ({ ...current, [order.id]: event.target.value }))}
                        className="mt-1 h-11 w-full rounded-btn border border-[#CDD4D0] px-3 font-normal"
                      />
                    </label>
                    <Button onClick={() => void recordSale(order.id, order.total)} disabled={busy === `sale:${order.id}`}>
                      Registrar cobro
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Banknote className="h-5 w-5 text-suya-green" aria-hidden="true" />Cobros pendientes de mesas</h2>
              <p className="mt-1 text-sm text-suya-muted">Solo aparecen mesas con pedidos entregados y saldo pendiente. El pago en efectivo también entra al libro del turno.</p>
            </div>
            {pendingTablePayments.length === 0 ? (
              <p className="rounded-btn border border-dashed border-suya-mist p-4 text-sm text-suya-muted">No hay cobros de mesa pendientes.</p>
            ) : (
              <div className="space-y-3">
                {pendingTablePayments.map((table) => (
                  <div key={table.id} className="grid gap-3 rounded-btn border border-suya-mist p-3 sm:grid-cols-[1fr_170px_auto] sm:items-end">
                    <div>
                      <p className="font-semibold">Mesa {table.tableNumber}</p>
                      <p className="text-sm text-suya-muted">Total canónico: {formatPrice(table.total)}</p>
                    </div>
                    <label className="text-sm font-semibold">
                      Recibido (S/)
                      <input
                        aria-label={`Efectivo recibido para mesa ${table.tableNumber}`}
                        inputMode="decimal"
                        min={table.total}
                        step="0.01"
                        type="number"
                        value={cashReceived[`table:${table.sessionId}`] ?? table.total.toFixed(2)}
                        onChange={(event) => setCashReceived((current) => ({ ...current, [`table:${table.sessionId}`]: event.target.value }))}
                        className="mt-1 h-11 w-full rounded-btn border border-[#CDD4D0] px-3 font-normal"
                      />
                    </label>
                    <Button onClick={() => void recordTablePayment(table)} disabled={busy === `table:${table.sessionId}`}>
                      Registrar cobro
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-4">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Scale className="h-5 w-5 text-suya-green" aria-hidden="true" />Ajuste explicado</h2>
                <p className="mt-1 text-sm text-suya-muted">Usa positivo para ingreso y negativo para salida; el motivo queda en el libro.</p>
              </div>
              <label className="text-sm font-semibold">Importe (S/)<input aria-label="Importe del ajuste" inputMode="decimal" type="number" step="0.01" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} className="mt-1 h-11 w-full rounded-btn border border-[#CDD4D0] px-3 font-normal" /></label>
              <label className="text-sm font-semibold">Motivo<textarea aria-label="Motivo del ajuste" value={adjustmentNote} onChange={(event) => setAdjustmentNote(event.target.value)} rows={3} className="mt-1 w-full rounded-btn border border-[#CDD4D0] px-3 py-2 font-normal" /></label>
              <Button variant="secondary" onClick={() => void addAdjustment()} disabled={busy === 'adjustment'}>Guardar ajuste</Button>
            </Card>
            <Card className="space-y-4">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-bold"><ClipboardCheck className="h-5 w-5 text-suya-green" aria-hidden="true" />Arqueo y cierre</h2>
                <p className="mt-1 text-sm text-suya-muted">El servidor compara el efectivo contado con el saldo esperado y exige nota si hay diferencia.</p>
              </div>
              <label className="text-sm font-semibold">Efectivo contado (S/)<input aria-label="Efectivo contado" inputMode="decimal" min="0" type="number" step="0.01" value={declaredCash} onChange={(event) => setDeclaredCash(event.target.value)} className="mt-1 h-11 w-full rounded-btn border border-[#CDD4D0] px-3 font-normal" /></label>
              <label className="text-sm font-semibold">Nota del cierre<textarea aria-label="Nota del cierre" value={closeNote} onChange={(event) => setCloseNote(event.target.value)} rows={3} className="mt-1 w-full rounded-btn border border-[#CDD4D0] px-3 py-2 font-normal" /></label>
              <Button onClick={() => void close()} disabled={busy === 'close'}>Cerrar turno y guardar arqueo</Button>
            </Card>
          </div>
        </>
      )}

      {visibleHistory.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-display text-lg font-bold">Historial de cierres</h2>
          <div className="divide-y divide-suya-mist">
            {visibleHistory.slice(0, 8).map((session) => (
              <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div><p className="font-semibold">{formatDateTime(session.closedAt ?? session.openedAt)}</p><p className="text-sm text-suya-muted">{session.entryCount} movimientos · Esperado {formatPrice(session.expectedCash)}</p></div>
                <p className={`font-semibold ${session.difference === 0 ? 'text-suya-green-dark' : 'text-[#8A6100]'}`}>{session.difference === 0 ? 'Cuadrado' : `Diferencia ${formatPrice(session.difference ?? 0)}`}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
