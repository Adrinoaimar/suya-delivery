import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, QrCode, Table2 } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { tableService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { formatPrice } from '@/utils/format';

export default function TablesOperationsPage() {
  const restaurantIds = useAuthStore((state) => state.identity?.restaurantIds ?? []);
  const [tables, setTables] = useState<Awaited<ReturnType<typeof tableService.list>>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void tableService.list(restaurantIds).then(setTables).catch((e) => setError(e instanceof Error ? e.message : 'No pudimos cargar las mesas.')); }, [restaurantIds]);
  return <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-2xl font-bold">Mesas y QR</h1><p className="mt-1 text-sm text-[#68716C]">Controla pedidos acumulados, cocina y pagos por mesa.</p></div><button type="button" disabled className="inline-flex items-center gap-2 rounded-xl bg-suya-green px-4 py-2.5 text-sm font-semibold text-white opacity-50"><QrCode className="h-4 w-4" aria-hidden="true" />Generar QR</button></div>{error ? <ErrorState description={error} onRetry={() => { setError(null); void tableService.list(restaurantIds).then(setTables).catch((e) => setError(e instanceof Error ? e.message : 'No pudimos cargar las mesas.')); }} /> : tables.length === 0 ? <Card className="border-dashed py-14 text-center"><Table2 className="mx-auto h-10 w-10 text-suya-green" aria-hidden="true" /><h2 className="mt-4 font-display text-lg font-bold">Aún no hay mesas configuradas</h2><p className="mx-auto mt-2 max-w-xl text-sm text-[#68716C]">Cuando el encargado cree mesas, aquí verás cada QR, pedidos activos, total acumulado y estado de pago.</p></Card> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tables.map((table) => <Card key={table.id}><div className="flex items-start justify-between"><div><p className="text-sm text-[#68716C]">Mesa</p><h2 className="font-display text-2xl font-bold">{table.tableNumber}</h2></div><Table2 className="h-6 w-6 text-suya-green" aria-hidden="true" /></div><p className="mt-4 text-sm font-semibold">{table.status === 'available' ? 'Disponible' : table.status === 'awaiting_payment' ? 'Pendiente de pago' : table.status === 'paid' ? 'Pagada' : 'Ocupada'}</p><p className="mt-1 text-sm text-[#68716C]">Acumulado: {formatPrice(table.total)}</p></Card>)}</div>}<Card className="flex items-start gap-3 bg-[#F7FAF8]"><ExternalLink className="mt-0.5 h-5 w-5 text-suya-green" aria-hidden="true" /><p className="text-sm text-[#52605A]">Los clientes podrán abrir un QR público con formato <code className="rounded bg-white px-1.5 py-0.5">/table/:token</code>. <Link to="/orders" className="font-semibold text-suya-green hover:underline">Ver pedidos actuales</Link></p></Card></div>;
}
