import { useState } from 'react';
import { ShoppingBag, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { Modal } from '@/components/common/Modal';
import { CartLine } from '@/components/order/CartLine';
import { FREE_DELIVERY_THRESHOLD } from '@/data';
import { cn } from '@/lib/cn';
import { storeService } from '@/lib/services';
import { cartTotals, useCartStore } from '@/store/cartStore';
import { formatPrice } from '@/utils/format';

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const storeId = useCartStore((state) => state.storeId);
  const increment = useCartStore((state) => state.increment);
  const decrement = useCartStore((state) => state.decrement);
  const clear = useCartStore((state) => state.clear);
  const [confirmClear, setConfirmClear] = useState(false);

  const store = storeId ? storeService.getStore(storeId) : undefined;
  const totals = cartTotals(items, store, FREE_DELIVERY_THRESHOLD);
  const missingForFreeDelivery = Math.max(0, FREE_DELIVERY_THRESHOLD - totals.subtotal);

  if (items.length === 0) {
    return (
      <div className="shell py-10">
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" />}
          title="Tu carrito está vacío"
          description="Explora los negocios de Sullana y arma tu pedido."
          action={<ButtonLink to="/stores">Explorar tiendas</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="shell space-y-4 py-4 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="section-title">Tu carrito</h1>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7076] hover:text-suya-danger"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Vaciar carrito
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
        <Card padded={false}>
          {store && (
            <div className="flex items-center justify-between gap-3 border-b border-suya-mist px-4 py-3">
              <div>
                <p className="font-display text-[15px] font-bold">{store.name}</p>
                <p className="text-xs text-[#6B7076]">
                  Entrega estimada {store.etaMin}–{store.etaMax} min
                </p>
              </div>
              <Link to={`/store/${store.id}`} className="text-sm font-semibold text-suya-green">
                Agregar más
              </Link>
            </div>
          )}
          <div className="divide-y divide-suya-mist px-4">
            {items.map((item) => (
              <CartLine
                key={item.lineId}
                item={item}
                onIncrement={increment}
                onDecrement={decrement}
              />
            ))}
          </div>
        </Card>

        <div className="space-y-3 lg:sticky lg:top-24">
          {store?.isLocal && missingForFreeDelivery > 0 && (
            <div className="rounded-card bg-suya-sun-soft px-4 py-3 text-sm text-suya-carbon">
              Te faltan <strong>{formatPrice(missingForFreeDelivery)}</strong> para el envío gratis
              en negocios locales.
            </div>
          )}

          <Card>
            <h2 className="font-display text-[15px] font-bold">Resumen</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#6B7076]">Subtotal</dt>
                <dd className="font-medium">{formatPrice(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7076]">Envío</dt>
                <dd className="font-medium">
                  {totals.freeDelivery ? (
                    <span className="text-suya-green">Gratis</span>
                  ) : (
                    formatPrice(totals.deliveryFee)
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#6B7076]">Descuento</dt>
                <dd className="font-medium">
                  {totals.discount > 0 ? `− ${formatPrice(totals.discount)}` : formatPrice(0)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-suya-mist pt-2.5 text-base">
                <dt className="font-display font-bold">Total</dt>
                <dd className="font-display font-bold">{formatPrice(totals.total)}</dd>
              </div>
            </dl>

            {store && totals.subtotal < store.minOrder ? (
              <p className="mt-3 rounded-btn bg-suya-mist/60 px-3 py-2 text-xs text-[#4A4F55]">
                El pedido mínimo de {store.name} es {formatPrice(store.minOrder)}.
              </p>
            ) : null}

            <ButtonLink
              to="/checkout"
              fullWidth
              size="lg"
              className={cn(
                'mt-4',
                store && totals.subtotal < store.minOrder && 'pointer-events-none opacity-50',
              )}
            >
              Continuar al pago
            </ButtonLink>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="¿Vaciar el carrito?"
        description="Se quitarán todos los productos que agregaste."
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setConfirmClear(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                clear();
                setConfirmClear(false);
              }}
            >
              Vaciar
            </Button>
          </div>
        }
      />
    </div>
  );
}
