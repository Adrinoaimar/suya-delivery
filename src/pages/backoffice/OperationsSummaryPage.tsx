import {
  BarChart3,
  Bike,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  UtensilsCrossed,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/common/Card';
import { isOperationalOrder } from '@/lib/orderOperations';
import { analyticsService } from '@/lib/services';
import type { AnalyticsDailyMetric } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { useOrderStore } from '@/store/orderStore';
import { formatPrice } from '@/utils/format';

export default function OperationsSummaryPage() {
  const identity = useAuthStore((state) => state.identity);
  const orders = useOrderStore((state) => state.orders);
  const isPlatformAdmin = identity?.access.includes('platform_admin') ?? false;
  const [dailyVisitors, setDailyVisitors] = useState<AnalyticsDailyMetric[]>([]);
  const [analyticsState, setAnalyticsState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );

  const loadAnalytics = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setAnalyticsState('loading');
    try {
      setDailyVisitors(await analyticsService.listDaily(14));
      setAnalyticsState('ready');
    } catch {
      setAnalyticsState('error');
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const today = useMemo(() => {
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return dailyVisitors.find((metric) => metric.visitDay === todayKey)?.uniqueVisitors ?? 0;
  }, [dailyVisitors]);
  const lastSevenDays = useMemo(
    () => dailyVisitors.slice(0, 7).reduce((total, metric) => total + metric.uniqueVisitors, 0),
    [dailyVisitors],
  );
  const active = orders.filter(
    (order) => !['delivered', 'cancelled'].includes(order.status) && isOperationalOrder(order),
  );
  const preparing = active.filter((order) => order.status === 'preparing').length;
  const inRoute = active.filter((order) =>
    ['picked_up', 'on_the_way'].includes(order.status),
  ).length;
  const delivered = orders.filter((order) => order.status === 'delivered');
  const cashDelivered = delivered.reduce((sum, order) => sum + order.total, 0);
  const metrics = [
    { label: 'Pedidos activos', value: String(active.length), icon: ClipboardList },
    { label: 'En preparación', value: String(preparing), icon: UtensilsCrossed },
    { label: 'En ruta', value: String(inRoute), icon: Bike },
    { label: 'Efectivo entregado', value: formatPrice(cashDelivered), icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Resumen</h1>
        <p className="mt-1 text-sm text-suya-muted">Estado real visible para operaciones.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} variant="glass">
            <metric.icon className="h-5 w-5 text-suya-green" aria-hidden="true" />
            <p className="mt-3 text-sm text-suya-muted">{metric.label}</p>
            <p className="font-display text-2xl font-bold">{metric.value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <p className="font-semibold">Datos conectados</p>
        <p className="mt-1 text-sm text-suya-muted">
          Los cambios de pedidos llegan mediante Supabase Realtime y respetan RLS.
        </p>
      </Card>
      {isPlatformAdmin && (
        <Card aria-labelledby="analytics-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-suya-green" aria-hidden="true" />
                <h2 id="analytics-title" className="font-display text-lg font-bold">
                  Visitas del sitio
                </h2>
              </div>
              <p className="mt-1 text-sm text-suya-muted">
                Navegadores únicos estimados por día, con consentimiento y sin IP, nombre ni correo.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-btn px-3 text-sm font-semibold text-suya-green-dark hover:bg-suya-mist disabled:opacity-60"
              onClick={() => void loadAnalytics()}
              disabled={analyticsState === 'loading'}
            >
              <RefreshCw
                className={`h-4 w-4 ${analyticsState === 'loading' ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Actualizar
            </button>
          </div>
          {analyticsState === 'error' && (
            <p className="mt-4 rounded-btn bg-red-50 p-3 text-sm text-red-800" role="alert">
              No se pudo cargar el medidor. Revisa la migración de analítica en Supabase.
            </p>
          )}
          {analyticsState !== 'error' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-btn bg-suya-ivory p-4">
                <p className="text-sm text-suya-muted">Navegadores únicos estimados hoy</p>
                <p className="mt-1 font-display text-3xl font-bold">{today}</p>
              </div>
              <div className="rounded-btn bg-suya-ivory p-4">
                <p className="text-sm text-suya-muted">Registros únicos por día · 7 días</p>
                <p className="mt-1 font-display text-3xl font-bold">{lastSevenDays}</p>
              </div>
            </div>
          )}
          {analyticsState === 'ready' && dailyVisitors.length === 0 && (
            <p className="mt-4 text-sm text-suya-muted">
              Aún no hay visitas consentidas registradas.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
