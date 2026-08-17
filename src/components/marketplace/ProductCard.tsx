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
}

export function ProductCard({ product, onSelect, disabled = false, className }: ProductCardProps) {
  return (
    <article
      className={cn(
        'relative flex gap-3 rounded-card border border-suya-mist bg-white p-3 shadow-card transition-shadow hover:shadow-soft',
        className,
      )}
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-suya-ivory">
        <Thumb name={product.name} src={product.image} variant="product" rounded="rounded-xl" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-display text-[15px] font-bold leading-snug">{product.name}</h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-[#6B7076]">{product.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Price value={product.price} />
          <button
            type="button"
            onClick={() => onSelect(product)}
            disabled={disabled}
            aria-label={`Agregar ${product.name}`}
            className="press flex h-11 w-11 items-center justify-center rounded-btn bg-suya-green text-white transition-colors hover:bg-suya-green-dark disabled:opacity-40"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </article>
  );
}
