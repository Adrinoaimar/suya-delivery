import { History } from 'lucide-react';
import { useOrderStore } from '@/store/orderStore';
import { formatDateTime, formatPrice, orderStatusLabel } from '@/utils/format';

export default function RiderHistoryPage() {
  const orders = useOrderStore((state) => state.orders);
  const history = orders.filter(
    (order) => order.status === 'delivered' || order.status === 'cancelled',
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="text-white">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <History className="h-6 w-6 text-suya-lime" aria-hidden="true" />
          Historial
        </h1>
        <p className="mt-1 text-sm text-white/70">
          {history.length} {history.length === 1 ? 'viaje registrado' : 'viajes registrados'} en esta
          demostración.
        </p>
      </header>

      {history.length === 0 ? (
        <p className="rounded-card border border-white/10 bg-white/5 p-6 text-center text-sm text-white/70">
          Todavía no hay viajes completados. Confirma un pedido desde la vista de cliente y espera a
          que la simulación llegue a «Entregado».
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
              <div className="shrink-0 text-right">
                <p className="font-display font-bold">{formatPrice(order.deliveryFee + 2.5)}</p>
                <p className="text-xs text-[#6B7076]">ganancia demo</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
