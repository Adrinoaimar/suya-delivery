import { Receipt } from 'lucide-react';
import { ButtonLink } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { SectionHeader } from '@/components/common/Card';
import { OrderCard } from '@/components/order/OrderCard';
import { selectActiveOrder, useOrderStore } from '@/store/orderStore';

export default function OrdersPage() {
  const orders = useOrderStore((state) => state.orders);
  const active = selectActiveOrder(orders);
  const history = orders.filter((order) => order.id !== active?.id);

  if (orders.length === 0) {
    return (
      <div className="shell py-10">
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="Todavía no tienes pedidos"
          description="Cuando hagas tu primer pedido lo verás aquí con su seguimiento."
          action={<ButtonLink to="/stores">Explorar tiendas</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="shell space-y-6 py-4 lg:py-8">
      <h1 className="section-title">Mis pedidos</h1>

      {active && (
        <section>
          <SectionHeader title="En curso" subtitle="Sigue tu pedido en tiempo real" />
          <OrderCard order={active} />
        </section>
      )}

      {history.length > 0 && (
        <section>
          <SectionHeader title="Historial" />
          <div className="space-y-3">
            {history.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
