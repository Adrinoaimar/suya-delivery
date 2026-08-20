import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Banknote, TicketPercent } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Input, Textarea } from '@/components/common/Input';
import { Skeleton } from '@/components/common/Skeleton';
import { FREE_DELIVERY_THRESHOLD } from '@/data';
import { notificationService, paymentService } from '@/lib/services';
import { useCatalogStore } from '@/store/catalogStore';
import { cartTotals, useCartStore } from '@/store/cartStore';
import { useOrderStore } from '@/store/orderStore';
import { useUserStore } from '@/store/userStore';
import { formatPrice } from '@/utils/format';
import type { PaymentMethod } from '@/types';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const items = useCartStore((state) => state.items);
  const storeId = useCartStore((state) => state.storeId);
  const clearCart = useCartStore((state) => state.clear);
  const createOrder = useOrderStore((state) => state.createOrder);
  const profile = useUserStore((state) => state.profile);
  const setProfile = useUserStore((state) => state.setProfile);

  const store = useCatalogStore((state) =>
    storeId ? state.stores.find((entry) => entry.id === storeId) : undefined,
  );
  const storesStatus = useCatalogStore((state) => state.storesStatus);
  const storesError = useCatalogStore((state) => state.storesError);
  const loadStores = useCatalogStore((state) => state.loadStores);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const [form, setForm] = useState({
    name: profile.name === 'Invitado' ? '' : profile.name,
    phone: profile.phone,
    address: profile.address,
    reference: profile.reference,
  });
  const method: PaymentMethod = 'cash';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const base = cartTotals(items, store, FREE_DELIVERY_THRESHOLD);
  const discount = 0;
  const deliveryFee = base.deliveryFee;
  const total = base.subtotal + deliveryFee;

  if (items.length === 0) {
    return (
      <div className="shell py-10">
        <EmptyState
          icon={<TicketPercent className="h-6 w-6" />}
          title="No hay nada para pagar"
          description="Agrega productos a tu carrito para completar el pedido."
          action={<ButtonLink to="/stores">Explorar tiendas</ButtonLink>}
        />
      </div>
    );
  }

  if (storesError) {
    return (
      <div className="shell py-10">
        <ErrorState description={storesError} onRetry={() => void loadStores(true)} />
      </div>
    );
  }

  if (!store) {
    // El catálogo ya llegó y el negocio no existe: no retenemos al cliente cargando.
    if (storesStatus === 'ready') {
      return (
        <div className="shell py-10">
          <EmptyState
            icon={<TicketPercent className="h-6 w-6" />}
            title="Este negocio ya no está disponible"
            description="Vuelve al catálogo y arma tu pedido en otro negocio de Sullana."
            action={<ButtonLink to="/stores">Explorar tiendas</ButtonLink>}
          />
        </div>
      );
    }

    return (
      <div className="shell space-y-4 py-10" role="status" aria-busy="true">
        <span className="sr-only">Cargando el checkout…</span>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-44 w-full rounded-card" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    );
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 3) next.name = 'Escribe tu nombre completo.';

    // Cuenta dígitos reales: «+  » pasaba el patrón anterior y guardaba un contacto inútil.
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 15) next.phone = 'Escribe un teléfono válido.';

    if (form.address.trim().length < 6) next.address = 'Indica la dirección de entrega.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate() || !store) return;

    // El mínimo también se comprueba aquí: llegar por URL directa o con el teclado
    // no debe permitir saltarse la restricción del negocio.
    if (base.subtotal < store.minOrder) {
      notificationService.notify(
        `El pedido mínimo de ${store.name} es ${formatPrice(store.minOrder)}.`,
        'warning',
      );
      return;
    }

    setSubmitting(true);
    try {
      const payment = await paymentService.authorize(method, total);
      if (!payment.ok) {
        notificationService.notify(payment.message, 'danger');
        return;
      }

      const order = await createOrder({
        storeId: store.id,
        items,
        subtotal: base.subtotal,
        deliveryFee,
        discount,
        customer: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          reference: form.reference.trim(),
        },
        paymentMethod: method,
      });

      setProfile({
        name: form.name,
        phone: form.phone,
        address: form.address,
        reference: form.reference,
      });
      clearCart();
      notificationService.notify(payment.message, 'success');
      navigate(`/orders/${order.id}/track`, { replace: true });
    } catch {
      notificationService.notify('No pudimos crear el pedido. Inténtalo nuevamente.', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="shell space-y-4 py-4 lg:py-8">
      <h1 className="section-title">Confirmar pedido</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-display text-[15px] font-bold">Datos de entrega</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Nombre y apellido"
                value={form.name}
                error={errors.name}
                autoComplete="name"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <Input
                label="Teléfono"
                type="tel"
                inputMode="tel"
                value={form.phone}
                error={errors.phone}
                autoComplete="tel"
                placeholder="987 654 321"
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Dirección"
                  value={form.address}
                  error={errors.address}
                  autoComplete="street-address"
                  placeholder="Av. José de Lama 480, Sullana"
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Textarea
                  label="Referencia"
                  rows={2}
                  value={form.reference}
                  hint="Ayuda al repartidor a encontrarte: color de fachada, piso, punto cercano."
                  onChange={(event) => setForm({ ...form, reference: event.target.value })}
                />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-[15px] font-bold">Método de pago</h2>
            <div className="flex items-center gap-3 rounded-btn border border-suya-green bg-suya-lime-soft p-3">
              <Banknote aria-hidden="true" className="h-5 w-5 text-suya-green" />
              <span>
                <span className="block text-[15px] font-semibold">Efectivo</span>
                <span className="block text-xs text-[#6B7076]">Paga al recibir tu pedido</span>
              </span>
            </div>
            <p className="mt-3 text-xs text-[#6B7076]">
              Próximamente habilitaremos pagos digitales mediante una pasarela confirmada por el
              servidor.
            </p>
          </Card>
        </div>

        <div className="space-y-3 lg:sticky lg:top-24">
          <Card>
            <h2 className="font-display text-[15px] font-bold">{store.name}</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {items.map((item) => (
                <li key={item.lineId} className="flex justify-between gap-3">
                  <span className="text-[#4A4F55]">
                    {item.quantity} × {item.name}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-2 border-t border-suya-mist pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#6B7076]">Subtotal</dt>
                <dd className="font-medium">{formatPrice(base.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7076]">Envío</dt>
                <dd className="font-medium">
                  {deliveryFee === 0 ? (
                    <span className="text-suya-green">Gratis</span>
                  ) : (
                    formatPrice(deliveryFee)
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7076]">Descuento</dt>
                <dd className="font-medium">
                  {discount > 0 ? `− ${formatPrice(discount)}` : formatPrice(0)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-suya-mist pt-2.5 text-base">
                <dt className="font-display font-bold">Total</dt>
                <dd className="font-display font-bold">{formatPrice(total)}</dd>
              </div>
            </dl>
            <Button type="submit" fullWidth size="lg" className="mt-4" disabled={submitting}>
              {submitting ? 'Procesando…' : `Confirmar pedido · ${formatPrice(total)}`}
            </Button>
            <p className="mt-2 text-center text-xs text-[#6B7076]">
              Revisa la dirección y el teléfono antes de confirmar.
            </p>
          </Card>
        </div>
      </div>
    </form>
  );
}
