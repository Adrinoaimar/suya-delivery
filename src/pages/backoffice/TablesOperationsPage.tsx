import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  ExternalLink,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Table2,
  ToggleLeft,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Card } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/common/Button';
import { notificationService, storeService, tableService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { formatPrice } from '@/utils/format';
import type { Store } from '@/types';
import type { TableSummary } from '@/lib/services';

const customerOrigin = () => import.meta.env.VITE_CUSTOMER_APP_URL || window.location.origin;

export default function TablesOperationsPage() {
  const identity = useAuthStore((state) => state.identity);
  const restaurantIds = useMemo(() => identity?.restaurantIds ?? [], [identity?.restaurantIds]);
  const isPlatformAdmin = identity?.access.includes('platform_admin') ?? false;
  const [stores, setStores] = useState<Store[]>([]);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [restaurantId, setRestaurantId] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRestaurantId = isPlatformAdmin
    ? restaurantId
    : restaurantIds.length === 1
      ? restaurantIds[0]
      : '';
  const visibleTables = useMemo(
    () =>
      activeRestaurantId
        ? tables.filter((table) => table.restaurantId === activeRestaurantId)
        : tables,
    [activeRestaurantId, tables],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allStores = await storeService.listStores();
      const visibleStores = allStores.filter(
        (store) => isPlatformAdmin || restaurantIds.includes(store.id),
      );
      const scopedIds = isPlatformAdmin ? visibleStores.map((store) => store.id) : restaurantIds;
      const rows = await tableService.list(scopedIds);
      setStores(visibleStores);
      setTables(rows);
      if (isPlatformAdmin)
        setRestaurantId((current) =>
          current && visibleStores.some((store) => store.id === current)
            ? current
            : visibleStores[0]?.id || '',
        );
      else setRestaurantId(restaurantIds.length === 1 ? restaurantIds[0] : '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar las mesas.');
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, restaurantIds]);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!activeRestaurantId || !tableNumber.trim()) {
      notificationService.notify(
        'Escribe el número de mesa para el restaurante de esta cuenta.',
        'warning',
      );
      return;
    }
    setBusy('create');
    try {
      const table = await tableService.create(activeRestaurantId, tableNumber);
      setTables((current) =>
        [...current, table].sort((a, b) => a.tableNumber.localeCompare(b.tableNumber)),
      );
      setTableNumber('');
      notificationService.notify(`Mesa ${table.tableNumber} creada con QR.`, 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos crear la mesa.',
        'danger',
      );
    } finally {
      setBusy(null);
    }
  };

  const rotate = async (table: TableSummary) => {
    setBusy(table.id);
    try {
      const next = await tableService.regenerateQr(table.id);
      setTables((current) => current.map((row) => (row.id === table.id ? next : row)));
      notificationService.notify(`QR de mesa ${table.tableNumber} regenerado.`, 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos regenerar el QR.',
        'danger',
      );
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (table: TableSummary) => {
    setBusy(table.id);
    try {
      await tableService.setActive(table.id, !table.active);
      setTables((current) =>
        current.map((row) => (row.id === table.id ? { ...row, active: !table.active } : row)),
      );
      notificationService.notify(table.active ? 'Mesa desactivada.' : 'Mesa activada.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos actualizar la mesa.',
        'danger',
      );
    } finally {
      setBusy(null);
    }
  };

  const qrUrl = (table: TableSummary) =>
    `${customerOrigin()}/table/${table.qrToken}?table=${encodeURIComponent(table.tableNumber)}&restaurant=${encodeURIComponent(table.restaurantId)}`;
  const copy = async (table: TableSummary) => {
    await navigator.clipboard.writeText(qrUrl(table));
    notificationService.notify('Enlace copiado.', 'success');
  };

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-suya-green">
            Operaciones
          </p>
          <h1 className="font-display text-2xl font-bold">Mesas y QR</h1>
          <p className="mt-1 text-sm text-[#68716C]">
            Crea mesas, imprime su QR y controla pedidos de salón.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </div>
      <Card className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        {isPlatformAdmin ? (
          <label className="text-sm font-semibold">
            Cuenta de restaurante
            <select
              value={restaurantId}
              onChange={(event) => setRestaurantId(event.target.value)}
              className="mt-1 h-11 w-full rounded-btn border border-[#CDD4D0] bg-white px-3 font-normal"
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
            <p className="text-xs font-semibold uppercase tracking-wider text-[#68716C]">
              Cuenta fijada
            </p>
            <p className="mt-1 text-sm font-semibold">
              {stores.find((store) => store.id === activeRestaurantId)?.name ??
                'Restaurante pendiente de vincular'}
            </p>
          </div>
        )}
        <label className="text-sm font-semibold">
          Número de mesa
          <input
            value={tableNumber}
            onChange={(event) => setTableNumber(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create();
            }}
            placeholder="Ej. 12"
            className="mt-1 h-11 w-full rounded-btn border border-[#CDD4D0] px-3 font-normal"
          />
        </label>
        <Button onClick={() => void create()} disabled={busy === 'create' || !activeRestaurantId}>
          <Plus className="h-4 w-4" />
          Crear mesa y QR
        </Button>
      </Card>
      {visibleTables.length === 0 && (
        <Card className="border-dashed py-14 text-center">
          <Table2 className="mx-auto h-10 w-10 text-suya-green" />
          <h2 className="mt-4 font-display text-lg font-bold">Aún no hay mesas configuradas</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[#68716C]">
            Crea la primera mesa para generar su código público y recibir pedidos en cocina.
          </p>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleTables.map((table) => {
          const store = stores.find((candidate) => candidate.id === table.restaurantId);
          return (
            <Card key={table.id} className={`space-y-4 ${!table.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#68716C]">
                    {store?.name ?? 'Restaurante'}
                  </p>
                  <h2 className="font-display text-2xl font-bold">Mesa {table.tableNumber}</h2>
                  <p className="mt-1 text-sm font-semibold">
                    {table.status === 'available'
                      ? 'Disponible'
                      : table.status === 'awaiting_payment'
                        ? 'Pendiente de pago'
                        : table.status === 'paid'
                          ? 'Pagada'
                          : 'Ocupada'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${table.active ? 'bg-suya-lime/25 text-suya-green-dark' : 'bg-[#E9EEEB] text-[#68716C]'}`}
                >
                  {table.active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-white p-2 shadow-sm">
                  <QRCodeSVG value={qrUrl(table)} size={116} level="M" includeMargin />
                </div>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    {table.sessionId ? 'Sesión abierta' : 'Sin sesión'}
                  </p>
                  <p className="mt-1 text-[#68716C]">Acumulado: {formatPrice(table.total)}</p>
                  <button
                    onClick={() => void copy(table)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-suya-green"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar enlace
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-suya-mist pt-3">
                <a
                  href={qrUrl(table)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-btn border border-suya-mist px-3 py-2 text-xs font-semibold"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir QR
                </a>
                <button
                  onClick={() => void rotate(table)}
                  disabled={busy === table.id}
                  className="inline-flex items-center gap-1.5 rounded-btn border border-suya-mist px-3 py-2 text-xs font-semibold"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Regenerar
                </button>
                <button
                  onClick={() => void toggle(table)}
                  disabled={busy === table.id}
                  className="inline-flex items-center gap-1.5 rounded-btn border border-suya-mist px-3 py-2 text-xs font-semibold"
                >
                  <ToggleLeft className="h-3.5 w-3.5" />
                  {table.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="flex items-start gap-3 bg-[#F7FAF8]">
        <QrCode className="mt-0.5 h-5 w-5 text-suya-green" />
        <p className="text-sm text-[#52605A]">
          Cada QR abre <code className="rounded bg-white px-1.5 py-0.5">/table/:token</code>. El
          token se genera y rota en servidor; el cliente nunca puede inventarlo ni cambiarlo.
        </p>
      </Card>
    </div>
  );
}
