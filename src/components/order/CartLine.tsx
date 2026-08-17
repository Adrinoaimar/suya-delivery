import { Price } from '@/components/common/Price';
import { QuantitySelector } from '@/components/common/QuantitySelector';
import { Thumb } from '@/components/common/Thumb';
import { lineTotal } from '@/store/cartStore';
import type { CartItem } from '@/types';

interface CartLineProps {
  item: CartItem;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  readOnly?: boolean;
}

export function CartLine({ item, onIncrement, onDecrement, readOnly = false }: CartLineProps) {
  return (
    <article className="flex gap-3 py-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-suya-ivory">
        <Thumb name={item.name} src={item.image} variant="product" rounded="rounded-xl" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[15px] font-bold leading-snug">{item.name}</h3>
        {item.extras.length > 0 && (
          <p className="mt-0.5 text-xs text-[#6B7076]">
            {item.extras.map((extra) => extra.label).join(' · ')}
          </p>
        )}
        {item.note.trim().length > 0 && (
          <p className="mt-0.5 text-xs italic text-[#6B7076]">«{item.note}»</p>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          {readOnly ? (
            <span className="text-sm text-[#6B7076]">Cantidad: {item.quantity}</span>
          ) : (
            <QuantitySelector
              size="sm"
              value={item.quantity}
              label={item.name}
              onIncrement={() => onIncrement(item.lineId)}
              onDecrement={() => onDecrement(item.lineId)}
            />
          )}
          <Price value={lineTotal(item)} />
        </div>
      </div>
    </article>
  );
}
