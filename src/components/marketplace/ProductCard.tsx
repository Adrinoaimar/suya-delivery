import { Plus } from 'lucide-react';
import { Price } from '@/components/common/Price';
import { Thumb } from '@/components/common/Thumb';
import { cn } from '@/lib/cn';
import type { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  disabled?: boolean;
  className?: string;
  /** Reemplaza el color del botón «Agregar» cuando la ficha usa la paleta del negocio. */
  accentClassName?: string;
}

export function ProductCard({
  product,
  onSelect,
  disabled = false,
  className,
  accentClassName,
}: ProductCardProps) {
  return (
    <article
      className={cn(
        'motion-press relative flex gap-3 rounded-card border border-suya-border bg-white/90 p-3 shadow-card transition-[transform,box-shadow] duration-300 ease-out motion-safe:active:scale-[0.985] motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-soft',
        className,
      )}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-suya-ivory">
        <Thumb name={product.name} src={product.image} variant="product" rounded="rounded-xl" />
        {product.image && product.imageIsStock && (
          <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-white">
            Ilustrativa
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-display text-[15px] font-bold leading-snug">{product.name}</h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-suya-muted">{product.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Price value={product.price} />
          <button
            type="button"
            onClick={() => onSelect(product)}
            disabled={disabled}
            aria-label={`Agregar ${product.name}`}
            className={cn(
              'press flex h-12 w-12 items-center justify-center rounded-btn text-white shadow-card transition-colors disabled:cursor-not-allowed disabled:bg-suya-mist disabled:text-suya-muted',
              accentClassName ?? 'bg-suya-green hover:bg-suya-green-dark',
            )}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </article>
  );
}
