import { Bike, CheckCircle2, ClipboardList, UtensilsCrossed } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { useOrderStore } from '@/store/orderStore';
import { formatPrice } from '@/utils/format';

export default function OperationsSummaryPage() {
  const orders = useOrderStore((state) => state.orders);
  const active = orders.filter((order) => !['delivered', 'cancelled'].includes(order.status));
  const preparing = active.filter((order) => order.status === 'preparing').length;
  const inRoute = active.filter((order) => ['picked_up', 'on_the_way'].includes(order.status)).length;
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
        <p className="mt-1 text-sm text-[#68716C]">Estado real visible para operaciones.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <metric.icon className="h-5 w-5 text-suya-green" aria-hidden="true" />
            <p className="mt-3 text-sm text-[#68716C]">{metric.label}</p>
            <p className="font-display text-2xl font-bold">{metric.value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <p className="font-semibold">Datos conectados</p>
        <p className="mt-1 text-sm text-[#68716C]">
          Los cambios de pedidos llegan mediante Supabase Realtime y respetan RLS.
        </p>
      </Card>
    </div>
  );
}
