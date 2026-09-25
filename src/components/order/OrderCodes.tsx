import { KeyRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Order } from '@/types';

interface OrderCodesProps {
  order: Order;
  className?: string;
}

/**
 * Código que el cliente entrega al repartidor para cerrar la entrega.
 */
export function OrderCodes({ order, className }: OrderCodesProps) {
  const closed = order.status === 'delivered' || order.status === 'cancelled';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="rounded-card border border-suya-green bg-suya-lime-soft p-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-suya-green-dark">
          <KeyRound aria-hidden="true" className="h-4 w-4" />
          Código de entrega
        </p>
        <p className="mt-1 font-display text-3xl font-bold tracking-[0.35em] text-suya-green-dark">
          {order.deliveryCode}
        </p>
        <p className="mt-1 text-sm text-[#4A4F55]">
          {closed
            ? 'Este pedido ya está cerrado.'
            : 'Dáselo al repartidor al recibir tu pedido. Sin este código no puede marcarlo como entregado.'}
        </p>
      </div>

    </div>
  );
}
