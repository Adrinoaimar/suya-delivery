import { Wallet } from 'lucide-react';
import { useOrderStore } from '@/store/orderStore';
import { formatPrice } from '@/utils/format';

const BONUS_PER_TRIP = 2.5;

export default function RiderEarningsPage() {
  const orders = useOrderStore((state) => state.orders);
  const delivered = orders.filter((order) => order.status === 'delivered');

  const total = delivered.reduce((sum, order) => sum + order.deliveryFee + BONUS_PER_TRIP, 0);
  const tips = delivered.length * 1.5;
  const average = delivered.length > 0 ? total / delivered.length : 0;

  const week = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day, index) => ({
    day,
    amount: delivered.length > 0 ? ((index % 4) + 1) * 12.5 : 0,
  }));
  const maxAmount = Math.max(1, ...week.map((item) => item.amount));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="text-white">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Wallet className="h-6 w-6 text-suya-lime" aria-hidden="true" />
          Ganancias
        </h1>
        <p className="mt-1 text-sm text-white/70">
          Cifras de demostración calculadas con los pedidos entregados en este navegador.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-card bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-[#6B7076]">Total</p>
          <p className="font-display text-xl font-bold">{formatPrice(total)}</p>
        </div>
        <div className="rounded-card bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-[#6B7076]">Propinas</p>
          <p className="font-display text-xl font-bold">{formatPrice(tips)}</p>
        </div>
        <div className="rounded-card bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-[#6B7076]">Por viaje</p>
          <p className="font-display text-xl font-bold">{formatPrice(average)}</p>
        </div>
      </section>

      <section className="rounded-card bg-white p-4">
        <h2 className="font-display text-[15px] font-bold">Semana</h2>
        <ul className="mt-4 flex h-40 items-end gap-2">
          {week.map((item) => (
            <li key={item.day} className="flex flex-1 flex-col items-center gap-2">
              <span
                className="w-full rounded-t-md bg-suya-green"
                style={{ height: `${Math.max(6, (item.amount / maxAmount) * 100)}%` }}
                aria-hidden="true"
              />
              <span className="text-xs text-[#6B7076]">{item.day}</span>
              <span className="sr-only">{formatPrice(item.amount)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[#9AA0A6]">
          DEMO DATA: la distribución semanal es ilustrativa y no proviene de pedidos reales.
        </p>
      </section>
    </div>
  );
}
