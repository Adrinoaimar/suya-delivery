import { useEffect, useState } from 'react';
import { CheckCircle2, CircleUserRound, Receipt, RefreshCw } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { Badge } from '@/components/common/Badge';
import { Button, ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { OrderCodes } from '@/components/order/OrderCodes';
import { orderService } from '@/lib/services';
import { useOrderStore } from '@/store/orderStore';
import { formatDateTime, formatPrice, orderStatusLabel } from '@/utils/format';
import type { Order } from '@/types';

interface GuestOrderLocationState {
  guestOrder?: Order;
}

function savedGuestOrder(id: string): Order | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem('suya.guestOrder') ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const order = value as Order;
    return order.id === id ? order : null;
  } catch {
    return null;
  }
}

/** Public receipt for menu/QR orders. No customer session required. */
export default function GuestOrderPage() {
  const { id = '', slug = '' } = useParams();
  const location = useLocation();
  const cached = useOrderStore((state) => state.getOrder(id));
  const [order, setOrder] = useState<Order | null>(
    (location.state as GuestOrderLocationState | null)?.guestOrder ?? cached ?? savedGuestOrder(id),
  );
  const [loading, setLoading] = useState(!order);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (order || !id) return;
    let active = true;
    setLoading(true);
    void orderService.get(id)
      .then((value) => {
        if (active) {
          setOrder(value ?? null);
          setError(value ? null : 'No encontramos este pedido.');
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'No pudimos cargar el pedido.');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, order]);

  useEffect(() => {
    if (!order) return;
    try { sessionStorage.setItem('suya.guestOrder', JSON.stringify(order)); } catch { /* storage unavailable */ }
  }, [order]);

  function refresh(): void {
    setOrder(null);
    setError(null);
  }

  if (loading) {
    return <div className="shell flex min-h-[65vh] items-center justify-center text-sm text-[#68716C]" role="status" aria-busy="true">Cargando comprobante…</div>;
  }

  if (!order || error) {
    return (
      <div className="shell py-10">
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No encontramos este pedido"
          description={error ?? 'Verifica el enlace o vuelve a abrir el menú.'}
          action={<ButtonLink to={`/menu/${slug}`}>Volver al menú</ButtonLink>}
        />
      </div>
    );
  }

  const tableOrder = order.origin === 'table_qr';
  const closed = order.status === 'delivered' || order.status === 'cancelled';

  return (
    <main id="contenido" className="shell max-w-3xl space-y-5 py-6 lg:py-10">
      <section className="rounded-card bg-suya-green p-6 text-white shadow-soft sm:p-8">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-white/75">Suya Menús</p>
            <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">
              {tableOrder ? 'Pedido enviado a tu mesa' : 'Pedido confirmado'}
            </h1>
            <p className="mt-2 text-sm text-white/80">
              Guarda este enlace para consultar el estado sin crear una cuenta.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Badge tone="lime">{orderStatusLabel(order.status)}</Badge>
          <span className="text-sm text-white/80">#{order.code} · {formatDateTime(order.createdAt)}</span>
        </div>
      </section>

      {!closed && !tableOrder && order.deliveryCode && <OrderCodes order={order} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:items-start">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">{order.storeName}</h2>
              <p className="mt-1 text-sm text-[#68716C]">{tableOrder ? 'Pedido en mesa' : 'Entrega a domicilio'}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={refresh} aria-label="Actualizar estado">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Actualizar
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-suya-mist border-y border-suya-mist">
            {order.items.map((item) => (
              <li key={item.lineId} className="flex justify-between gap-4 py-3 text-sm">
                <span>{item.quantity} × {item.name}</span>
                <span className="font-semibold">{formatPrice((item.unitPrice + item.extras.reduce((sum, extra) => sum + extra.price, 0)) * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between font-display text-lg font-bold">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-[15px] font-bold">Datos del pedido</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-[#68716C]">Cliente</dt>
              <dd className="font-medium">{order.customer.name}</dd>
            </div>
            <div>
              <dt className="text-[#68716C]">Contacto</dt>
              <dd className="font-medium">{order.customer.phone}</dd>
            </div>
            <div>
              <dt className="text-[#68716C]">{tableOrder ? 'Atención' : 'Dirección'}</dt>
              <dd className="font-medium">{order.customer.address || 'Confirmado con el negocio'}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="border-suya-sun bg-suya-sun-soft">
        <div className="flex items-start gap-3">
          <CircleUserRound className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6100]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-[15px] font-bold">¿Quieres beneficios Suya?</h2>
            <p className="mt-1 text-sm text-[#5E511F]">Crea Suya Account para guardar tus datos, consultar pedidos desde cualquier dispositivo y recibir beneficios exclusivos. No es necesario para pedir.</p>
            <ButtonLink to="/login" state={{ from: location.pathname }} variant="ghost" size="sm" className="mt-3 border-[#8A6100]/30 text-[#6B5100]">
              Ingresar a Suya Account
            </ButtonLink>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <ButtonLink to={`/menu/${slug}`} variant="primary">Volver al menú</ButtonLink>
        <ButtonLink to="/" variant="ghost">Ir a Suya Delivery</ButtonLink>
      </div>
    </main>
  );
}
