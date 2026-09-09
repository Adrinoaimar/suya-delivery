import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Banknote, CircleUserRound, LocateFixed, MapPin, TicketPercent } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Input, Textarea } from '@/components/common/Input';
import { Skeleton } from '@/components/common/Skeleton';
import { FREE_DELIVERY_THRESHOLD } from '@/lib/commerce';
import { locationService, notificationService, offerService, paymentService } from '@/lib/services';
import { useCatalogStore } from '@/store/catalogStore';
import { cartTotals, useCartStore } from '@/store/cartStore';
import { useOrderStore } from '@/store/orderStore';
import { useAuthStore } from '@/store/authStore';
import { formatPrice } from '@/utils/format';
import type { AppOffer, PaymentMethod } from '@/types';
import type { LatLng } from '@/types';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const items = useCartStore((state) => state.items);
  const storeId = useCartStore((state) => state.storeId);
  const clearCart = useCartStore((state) => state.clear);
  const orderOrigin = useCartStore((state) => state.origin);
  const menuSlug = useCartStore((state) => state.menuSlug);
  const offerCode = useCartStore((state) => state.offerCode);
  const setOfferCode = useCartStore((state) => state.setOfferCode);
  const createOrder = useOrderStore((state) => state.createOrder);
  const identity = useAuthStore((state) => state.identity);
  const [tableContext] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('suya.tableContext') ?? 'null') as {
        tableId?: string;
        tableNumber?: string;
        sessionId?: string | null;
      } | null;
    } catch { return null; }
  });
  const isTableOrder = Boolean(tableContext?.tableId);

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
    name: identity?.displayName ?? '',
    phone: identity?.phone ?? '',
    address: identity?.defaultAddress ?? (isTableOrder ? `Mesa ${tableContext?.tableNumber ?? ''}`.trim() : ''),
    reference: identity?.defaultReference ?? '',
  });
  const method: PaymentMethod = 'cash';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [deliveryPosition, setDeliveryPosition] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [offerInput, setOfferInput] = useState(offerCode ?? '');
  const [offers, setOffers] = useState<AppOffer[]>([]);
  const isMenuOrder = orderOrigin === 'suya_menu' || Boolean(tableContext?.tableId);
  const isDeliveryOrder = !isMenuOrder;
  const isGuestMenuOrder = isMenuOrder && !identity;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void offerService.listActive().then(setOffers).catch(() => setOffers([]));
  }, []);
  useEffect(() => { setOfferInput(offerCode ?? ''); }, [offerCode]);

  const base = cartTotals(items, store, FREE_DELIVERY_THRESHOLD);
  const selectedOffer = offers.find((offer) => offer.code === offerCode && (!offer.restaurantId || offer.restaurantId === storeId));
  const offerMeetsMinimum = selectedOffer ? base.subtotal >= selectedOffer.minimumSubtotal : false;
  const rawDiscount = selectedOffer && offerMeetsMinimum
    ? selectedOffer.discountType === 'percent'
      ? base.subtotal * selectedOffer.discountValue / 100
      : selectedOffer.discountValue
    : 0;
  const discount = Math.min(rawDiscount, base.subtotal + (isDeliveryOrder ? base.deliveryFee : 0));
  const deliveryFee = isDeliveryOrder ? base.deliveryFee : 0;
  const total = Math.max(0, base.subtotal + deliveryFee - discount);

  function applyOffer() {
    const code = offerInput.trim().toUpperCase();
    const offer = offers.find((item) => item.code === code);
    if (!offer) { notificationService.notify('Esa oferta no está vigente en la app.', 'warning'); return; }
    if (offer.restaurantId && offer.restaurantId !== storeId) { notificationService.notify('Esta oferta no aplica a este negocio.', 'warning'); return; }
    if (base.subtotal < offer.minimumSubtotal) { notificationService.notify(`Compra al menos ${formatPrice(offer.minimumSubtotal)} para usarla.`, 'warning'); return; }
    setOfferCode(code);
    notificationService.notify('Oferta aplicada. El servidor validará el descuento al confirmar.', 'success');
  }

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

    if (isDeliveryOrder && form.address.trim().length < 6) next.address = 'Indica la dirección de entrega.';
    if (isDeliveryOrder && !deliveryPosition) next.location = 'Confirma el punto de entrega con GPS.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function locateDelivery(): Promise<void> {
    if (!locationService.isSupported()) {
      setErrors((current) => ({ ...current, location: 'Este dispositivo no ofrece ubicación.' }));
      return;
    }
    setLocating(true);
    try {
      const reading = await locationService.getCurrent();
      setDeliveryPosition(reading.position);
      setErrors((current) => {
        const { location: _location, ...rest } = current;
        return rest;
      });
    } catch (error) {
      setErrors((current) => ({
        ...current,
        location: error instanceof Error
          ? error.message
          : 'No pudimos obtener tu ubicación. Activa GPS y permiso de Suya.',
      }));
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!store) return;
    if (!validate()) {
      notificationService.notify(
        `Revisa los datos ${isTableOrder ? 'del pedido' : 'de entrega'}: falta algo antes de confirmar.`,
        'warning',
      );
      return;
    }

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

      let tableSessionId = tableContext?.sessionId ?? undefined;
      if (tableContext?.tableId && !tableSessionId) {
        const { tableService } = await import('@/lib/services');
        tableSessionId = await tableService.open(tableContext.tableId);
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
          address: isTableOrder
            ? `Mesa ${tableContext?.tableNumber ?? 'asignada'}`
            : isDeliveryOrder
              ? form.address.trim()
              : 'Pedido desde Suya Menús',
          reference: form.reference.trim(),
        },
        deliveryPosition: isDeliveryOrder ? deliveryPosition! : null,
        paymentMethod: method,
        tableId: tableContext?.tableId,
        tableSessionId,
        origin: tableContext?.tableId ? 'table_qr' : orderOrigin,
        offerCode: selectedOffer?.code,
      });

      const publicOrderPath = isGuestMenuOrder
        ? (orderOrigin === 'suya_menu' && menuSlug
          ? `/menu/${menuSlug}/pedido/${order.id}`
          : `/pedido/${order.id}`)
        : null;
      clearCart();
      sessionStorage.removeItem('suya.tableContext');
      if (publicOrderPath) {
        try { sessionStorage.setItem('suya.guestOrder', JSON.stringify(order)); } catch { /* storage unavailable */ }
      }
      notificationService.notify(
        isMenuOrder
          ? `Pedido confirmado. Pagarás ${formatPrice(order.total)} en efectivo.`
          : `Pedido confirmado. Pagarás ${formatPrice(order.total)} en efectivo al recibirlo.`,
        'success',
      );
      navigate(publicOrderPath ?? `/orders/${order.id}/track`, {
        replace: true,
        state: publicOrderPath ? { guestOrder: order } : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos crear el pedido. Inténtalo nuevamente.';
      notificationService.notify(message, 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="shell space-y-4 py-4 lg:py-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-suya-green">
          {isMenuOrder ? 'Suya Menús' : 'Suya Delivery'}
        </p>
        <h1 className="section-title">Confirmar pedido</h1>
        {isGuestMenuOrder && (
          <p className="mt-1 text-sm text-[#68716C]">Puedes pedir como invitado. No necesitas crear una cuenta.</p>
        )}
      </div>

      {isGuestMenuOrder && (
        <Card className="border-suya-sun bg-suya-sun-soft">
          <div className="flex items-start gap-3">
            <CircleUserRound className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6100]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[15px] font-bold text-suya-carbon">Suya Account es opcional</h2>
              <p className="mt-1 text-sm leading-5 text-[#5E511F]">
                Ingresa para guardar tus datos, ver beneficios exclusivos y consultar tus pedidos desde cualquier dispositivo. También puedes continuar sin cuenta.
              </p>
              <ButtonLink to="/login" state={{ from: location.pathname }} variant="ghost" size="sm" className="mt-3 border-[#8A6100]/30 text-[#6B5100]">
                Ingresar a Suya Account
              </ButtonLink>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-display text-[15px] font-bold">
              {isTableOrder ? 'Datos de mesa' : isDeliveryOrder ? 'Datos de entrega' : 'Datos del pedido'}
            </h2>
            {isTableOrder && (
              <p className="mb-3 rounded-btn bg-suya-lime-soft px-3 py-2 text-sm text-suya-green-dark">
                Pedido para <strong>Mesa {tableContext?.tableNumber ?? 'asignada'}</strong>. No necesitas indicar dirección ni activar GPS.
              </p>
            )}
            {isMenuOrder && !isTableOrder && (
              <p className="mb-3 rounded-btn bg-suya-lime-soft px-3 py-2 text-sm text-suya-green-dark">
                Pedido rápido: solo necesitamos tu nombre y número. La nota es opcional.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Nombre y apellido"
                value={form.name}
                error={errors.name}
                autoComplete="name"
                required
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <Input
                label={isMenuOrder ? 'Número de celular' : 'Teléfono'}
                type="tel"
                inputMode="tel"
                value={form.phone}
                error={errors.phone}
                autoComplete="tel"
                placeholder="987 654 321"
                required
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
              {isDeliveryOrder && <div className="sm:col-span-2">
                <Input
                  label="Dirección"
                  value={form.address}
                  error={errors.address}
                  autoComplete="street-address"
                  placeholder="Av. José de Lama 480, Sullana"
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </div>}
              <div className="sm:col-span-2">
                <Textarea
                  label={isMenuOrder ? 'Nota para el local (opcional)' : 'Referencia (opcional)'}
                  rows={2}
                  value={form.reference}
                  maxLength={300}
                  hint={isMenuOrder
                    ? 'Agrega una indicación especial si la necesitas.'
                    : 'Ayuda al repartidor a encontrarte: color de fachada, piso, punto cercano.'}
                  placeholder={isMenuOrder ? 'Ej. Sin cebolla' : undefined}
                  onChange={(event) => setForm({ ...form, reference: event.target.value })}
                />
              </div>
              {isDeliveryOrder && <div className="sm:col-span-2 rounded-btn border border-suya-mist p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-suya-green" aria-hidden="true" />
                    Punto exacto de entrega
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={locateDelivery} disabled={locating}>
                    <LocateFixed className="h-4 w-4" aria-hidden="true" />
                    {locating ? 'Ubicando…' : deliveryPosition ? 'Actualizar GPS' : 'Usar mi ubicación'}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-[#6B7076]">
                  {deliveryPosition
                    ? `Punto confirmado: ${deliveryPosition.lat.toFixed(5)}, ${deliveryPosition.lng.toFixed(5)}`
                    : 'Solo se solicita al tocar el botón. No enviamos tu dirección a geocodificadores públicos.'}
                </p>
                {errors.location && <p className="mt-1 text-xs text-red-700" role="alert">{errors.location}</p>}
              </div>}
            </div>
          </Card>

          {Capacitor.isNativePlatform() && (
            <Card>
              <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-bold"><TicketPercent className="h-4 w-4 text-suya-green" />Oferta exclusiva de la app</h2>
              <div className="flex flex-col gap-2 sm:flex-row"><Input label="Código de oferta" value={offerInput} onChange={(event) => setOfferInput(event.target.value.toUpperCase())} placeholder="SUYA10" /><Button type="button" variant="secondary" className="self-end sm:mb-0.5" onClick={applyOffer}>Aplicar</Button></div>
              {selectedOffer && offerMeetsMinimum && <p className="mt-2 text-sm font-semibold text-suya-green">{selectedOffer.title}: − {formatPrice(discount)} aplicado.</p>}
              {offerCode && !selectedOffer && <p className="mt-2 text-sm text-red-700">La oferta ya no está vigente o no aplica a este negocio.</p>}
              {selectedOffer && !offerMeetsMinimum && <p className="mt-2 text-sm text-[#6B7076]">Compra mínima: {formatPrice(selectedOffer.minimumSubtotal)}.</p>}
              {offerCode && <button type="button" className="mt-2 text-xs font-semibold text-[#6B7076] underline" onClick={() => setOfferCode(null)}>Quitar oferta</button>}
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-display text-[15px] font-bold">Método de pago</h2>
            <div className="flex items-center gap-3 rounded-btn border border-suya-green bg-suya-lime-soft p-3">
              <Banknote aria-hidden="true" className="h-5 w-5 text-suya-green" />
              <span>
                <span className="block text-[15px] font-semibold">Efectivo</span>
                <span className="block text-xs text-[#6B7076]">
                  {isTableOrder
                    ? 'Paga en caja o al solicitar la cuenta'
                    : isDeliveryOrder
                      ? 'Paga al recibir tu pedido'
                      : 'Paga directamente en el local'}
                </span>
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
                <dt className="text-[#6B7076]">{isTableOrder || !isDeliveryOrder ? 'Atención en mesa' : 'Envío'}</dt>
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
              {isDeliveryOrder
                ? 'Revisa la dirección y el teléfono antes de confirmar.'
                : 'Revisa tu nombre y número antes de confirmar.'}
            </p>
          </Card>
        </div>
      </div>
    </form>
  );
}
