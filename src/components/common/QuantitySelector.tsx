import { Minus, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface QuantitySelectorProps {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function QuantitySelector({
  value,
  onIncrement,
  onDecrement,
  min = 1,
  label = 'producto',
  size = 'md',
  className,
}: QuantitySelectorProps) {
  const isRemove = value <= min && min === 1;
  const button =
    size === 'sm'
      ? 'h-11 w-11 min-w-11'
      : 'h-12 w-12 min-w-12';

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-btn border border-suya-mist bg-white',
        className,
      )}
    >
      <button
        type="button"
        onClick={onDecrement}
        aria-label={isRemove ? `Quitar ${label}` : `Disminuir cantidad de ${label}`}
        className={cn(
          'press flex items-center justify-center rounded-l-btn text-suya-carbon hover:bg-suya-mist/60',
          button,
        )}
      >
        {isRemove ? <Trash2 className="h-4 w-4 text-suya-danger" /> : <Minus className="h-4 w-4" />}
      </button>
      <span
        className="min-w-8 text-center font-display text-[15px] font-bold tabular-nums"
        aria-live="polite"
        aria-label={`Cantidad: ${value}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label={`Aumentar cantidad de ${label}`}
        className={cn(
          'press flex items-center justify-center rounded-r-btn text-suya-green hover:bg-suya-lime-soft',
          button,
        )}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
