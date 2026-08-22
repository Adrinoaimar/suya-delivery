import { History, MapPin, Package } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { TrackingTimeline } from '@/components/order/TrackingTimeline';
import { useOrderStore } from '@/store/orderStore';
import { formatDateTime, orderStatusLabel } from '@/utils/format';

export default function RiderHistoryPage() {
  const orders = useOrderStore((state) => state.orders);
  const history = orders.filter(
    (order) => order.status === 'delivered' || order.status === 'cancelled',
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = history.find((order) => order.id === selectedId);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="text-white">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <History className="h-6 w-6 text-suya-lime" aria-hidden="true" />
          Historial
        </h1>
        <p className="mt-1 text-sm text-white/70">
          {history.length} {history.length === 1 ? 'viaje registrado' : 'viajes registrados'}.
        </p>
      </header>

      {history.length === 0 ? (
        <p className="rounded-card border border-white/10 bg-white/5 p-6 text-center text-sm text-white/70">
          Todavía no hay viajes completados para esta cuenta.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {history.map((order) => (
            <li
              key={order.id}
              className="flex items-center justify-between gap-3 rounded-card bg-white p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold">{order.storeName}</p>
                <p className="text-xs text-[#6B7076]">
                  #{order.code} · {formatDateTime(order.createdAt)}
                </p>
                <p className="text-xs text-[#6B7076]">{orderStatusLabel(order.status)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}>
                {selectedId === order.id ? 'Ocultar' : 'Ver detalle'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {selected && <section className="rounded-card bg-white p-4" aria-label={`Detalle ${selected.code}`}>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Package className="h-5 w-5 text-suya-green" />Detalle #{selected.code}</h2>
        <p className="mt-1 text-sm text-[#6B7076]">{selected.storeName} · {formatDateTime(selected.createdAt)}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><h3 className="font-display font-bold">Productos</h3><ul className="mt-2 space-y-1 text-sm text-[#4A4F55]">{selected.items.map((item) => <li key={item.lineId}>{item.quantity} × {item.name}</li>)}</ul><p className="mt-2 font-bold">Total S/ {selected.total.toFixed(2)}</p></div>
          <div><h3 className="flex items-center gap-1 font-display font-bold"><MapPin className="h-4 w-4 text-suya-green" />Entrega</h3><p className="mt-2 text-sm text-[#4A4F55]">{selected.customer.name}</p><p className="text-sm text-[#6B7076]">{selected.customer.address}</p></div>
        </div>
        {selected.cancellationReason && <p className="mt-3 rounded-btn bg-suya-danger-soft p-3 text-sm text-suya-danger">Motivo de cancelación: {selected.cancellationReason}</p>}
        <div className="mt-4 border-t border-suya-mist pt-4"><h3 className="mb-3 font-display font-bold">Seguimiento</h3><TrackingTimeline order={selected} /></div>
      </section>}
    </div>
  );
}
