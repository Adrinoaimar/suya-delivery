import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Price } from '@/components/common/Price';
import { QuantitySelector } from '@/components/common/QuantitySelector';
import { Textarea } from '@/components/common/Input';
import { Thumb } from '@/components/common/Thumb';
import { notificationService } from '@/lib/services';
import { useCartStore } from '@/store/cartStore';
import { formatPrice } from '@/utils/format';
import type { Product, ProductExtra } from '@/types';

interface ProductSheetProps {
  product: Product | null;
  onClose: () => void;
}

/** Detalle del producto: cantidad, extras, instrucciones y agregar al carrito. */
export function ProductSheet({ product, onClose }: ProductSheetProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [quantity, setQuantity] = useState(1);
  const [extras, setExtras] = useState<ProductExtra[]>([]);
  const [note, setNote] = useState('');
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    setQuantity(1);
    setExtras([]);
    setNote('');
    setConflict(false);
  }, [product?.id]);

  if (!product) return null;

  const extrasTotal = extras.reduce((sum, extra) => sum + extra.price, 0);
  const total = (product.price + extrasTotal) * quantity;

  function toggleExtra(extra: ProductExtra) {
    setExtras((current) =>
      current.some((item) => item.id === extra.id)
        ? current.filter((item) => item.id !== extra.id)
        : [...current, extra],
    );
  }

  function handleAdd(replaceStore = false) {
    if (!product) return;
    const added = addItem({ product, quantity, extras, note }, { replaceStore });
    if (!added) {
      setConflict(true);
      return;
    }
    notificationService.notify('Agregado al carrito', 'success');
    onClose();
  }

  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      title={product.name}
      footer={
        <div className="flex items-center gap-3">
          <QuantitySelector
            value={quantity}
            min={1}
            label={product.name}
            onIncrement={() => setQuantity((value) => Math.min(20, value + 1))}
            onDecrement={() => setQuantity((value) => Math.max(1, value - 1))}
          />
          <Button fullWidth onClick={() => handleAdd(false)}>
            Agregar · {formatPrice(total)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="relative h-40 overflow-hidden rounded-card bg-suya-ivory">
          <Thumb
            name={product.name}
            src={product.image}
            variant="product"
            rounded="rounded-card"
            textClassName="text-4xl"
          />
          {product.image && product.imageIsStock && (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
              Foto ilustrativa, no del negocio
            </span>
          )}
        </div>

        <div>
          <p className="text-sm text-[#6B7076]">{product.description}</p>
          <Price value={product.price} size="lg" className="mt-2 block" />
        </div>

        {product.extras.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 font-display text-[15px] font-bold">Extras</legend>
            {product.extras.map((extra) => {
              const checked = extras.some((item) => item.id === extra.id);
              return (
                <label
                  key={extra.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-btn border border-suya-mist px-3 py-2.5 transition-colors hover:border-suya-lime"
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExtra(extra)}
                      className="h-5 w-5 accent-[#0E6B44]"
                    />
                    <span className="text-[15px]">{extra.label}</span>
                  </span>
                  <span className="text-sm font-semibold text-suya-green">
                    {extra.price === 0 ? 'Sin costo' : `+ ${formatPrice(extra.price)}`}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <Textarea
          label="Instrucciones para el negocio"
          placeholder="Ej.: sin cebolla, tocar el timbre dos veces"
          value={note}
          maxLength={140}
          onChange={(event) => setNote(event.target.value)}
        />

        {conflict && (
          <div className="flex gap-3 rounded-btn border border-suya-sun bg-suya-sun-soft p-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6100]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-suya-carbon">
                Tu carrito tiene productos de otro negocio
              </p>
              <p className="mt-0.5 text-sm text-[#6B7076]">
                Solo puedes pedir de un negocio a la vez. ¿Quieres vaciar el carrito y agregar este
                producto?
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => handleAdd(true)}>
                  Vaciar y agregar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConflict(false)}>
                  Mantener carrito
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
