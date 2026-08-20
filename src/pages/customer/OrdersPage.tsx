import { Receipt } from 'lucide-react';
import { ButtonLink } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Skeleton } from '@/components/common/Skeleton';
import { SectionHeader } from '@/components/common/Card';
import { OrderCard } from '@/components/order/OrderCard';
import { selectActiveOrder, useOrderStore } from '@/store/orderStore';

export default function OrdersPage() {
  const orders = useOrderStore((state) => state.orders);
  const status = useOrderStore((state) => state.status);
  const error = useOrderStore((state) => state.error);
  const refresh = useOrderStore((state) => state.refresh);
  const active = selectActiveOrder(orders);
  const history = orders.filter((order) => order.id !== active?.id);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="shell space-y-3 py-10" role="status" aria-busy="true">
        <span className="sr-only">Cargando pedidos…</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="shell py-10">
        <ErrorState description={error ?? undefined} onRetry={() => void refresh()} />
      </div>
    );
  }

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
