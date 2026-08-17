import { useState } from 'react';
import type { FormEvent } from 'react';
import { BadgeCheck, Banknote, CreditCard, Smartphone, TicketPercent } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { Input, Textarea } from '@/components/common/Input';
import { FREE_DELIVERY_THRESHOLD } from '@/data';
import { cn } from '@/lib/cn';
import { notificationService, paymentService, storeService } from '@/lib/services';
import { cartTotals, useCartStore } from '@/store/cartStore';
import { useOrderStore } from '@/store/orderStore';
import { useUserStore } from '@/store/userStore';
import { formatPrice } from '@/utils/format';
import type { PaymentMethod } from '@/types';

const METHODS: { id: PaymentMethod; label: string; description: string; icon: typeof Banknote }[] = [
  { id: 'cash', label: 'Efectivo', description: 'Pagas al recibir', icon: Banknote },
  { id: 'yape', label: 'Yape', description: 'Simulado, sin cobro real', icon: Smartphone },
  { id: 'card', label: 'Tarjeta', description: 'Simulada, sin cobro real', icon: CreditCard },
];

/** Cupones de demostración. */
const COUPONS: Record<string, { label: string; freeDelivery?: boolean; percent?: number }> = {
  SUYA20: { label: 'Envío gratis', freeDelivery: true },
  DULCE15: { label: '15% de descuento', percent: 0.15 },
};

export default function CheckoutPage() {
  const navigate = useNavigate();
  const items = useCartStore((state) => state.items);
  const storeId = useCartStore((state) => state.storeId);
  const clearCart = useCartStore((state) => state.clear);
  const createOrder = useOrderStore((state) => state.createOrder);
  const profile = useUserStore((state) => state.profile);
  const setProfile = useUserStore((state) => state.setProfile);

  const store = storeId ? storeService.getStore(storeId) : undefined;
  const [form, setForm] = useState({
    name: profile.name === 'Invitado' ? '' : profile.name,
    phone: profile.phone,
    address: profile.address,
    reference: profile.reference,
  });
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const applied = coupon ? COUPONS[coupon] : undefined;
  const base = cartTotals(items, store, FREE_DELIVERY_THRESHOLD);
  const discount = applied?.percent ? base.subtotal * applied.percent : 0;
  const deliveryFee = applied?.freeDelivery ? 0 : base.deliveryFee;
  const total = Math.max(0, base.subtotal + deliveryFee - discount);

  if (items.length === 0 || !store) {
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

  function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (COUPONS[code]) {
      setCoupon(code);
      notificationService.notify(`Cupón aplicado: ${COUPONS[code]!.label}`, 'success');
    } else {
      notificationService.notify('Ese cupón no es válido en la demo.', 'warning');
    }
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
    const payment = await paymentService.authorize(method, total);
    setSubmitting(false);
    if (!payment.ok) {
      notificationService.notify('No pudimos registrar el pago simulado.', 'danger');
      return;
    }

    setProfile({
      name: form.name,
      phone: form.phone,
      address: form.address,
      reference: form.reference,
    });

    const order = createOrder({
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

    clearCart();
    notificationService.notify(payment.message, 'success');
    navigate(`/orders/${order.id}/track`, { replace: true });
  }

  return (
    <form onSubmit={handleSubmit} className="shell space-y-4 py-4 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="section-title">Confirmar pedido</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-suya-mist px-3 py-1 text-xs font-semibold text-[#4A4F55]">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Modo demostración: no se realizan cobros reales
        </span>
      </div>

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
            <div className="grid gap-2 sm:grid-cols-3">
              {METHODS.map((option) => {
                const Icon = option.icon;
                const active = method === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMethod(option.id)}
                    aria-pressed={active}
                    className={cn(
                      'press flex items-center gap-3 rounded-btn border p-3 text-left transition-colors',
                      active
                        ? 'border-suya-green bg-suya-lime-soft'
                        : 'border-suya-mist hover:border-suya-lime',
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn('h-5 w-5', active ? 'text-suya-green' : 'text-[#6B7076]')}
                    />
                    <span>
                      <span className="block text-[15px] font-semibold">{option.label}</span>
                      <span className="block text-xs text-[#6B7076]">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-[#6B7076]">
              Ningún dato de pago se envía a un servidor: la autorización es simulada localmente.
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-[15px] font-bold">Cupón</h2>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Código de cupón"
                  value={couponInput}
                  placeholder="SUYA20"
                  onChange={(event) => setCouponInput(event.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={applyCoupon} className="mb-[2px]">
                Aplicar
              </Button>
            </div>
            {applied && (
              <p className="mt-2 text-sm font-medium text-suya-green">
                Cupón {coupon} activo: {applied.label}
              </p>
            )}
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
              Al confirmar se genera un pedido local con seguimiento simulado.
            </p>
          </Card>
        </div>
      </div>
    </form>
  );
}
