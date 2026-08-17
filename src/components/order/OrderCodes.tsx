import { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldX } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Order } from '@/types';

interface OrderCodesProps {
  order: Order;
  className?: string;
}

/**
 * Códigos del pedido, visibles solo para el cliente:
 * uno para que el repartidor cierre la entrega y otro para cancelar.
 */
export function OrderCodes({ order, className }: OrderCodesProps) {
  const [showCancel, setShowCancel] = useState(false);
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

      {!closed && (
        <div className="rounded-card border border-suya-mist bg-white p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldX aria-hidden="true" className="h-4 w-4 text-suya-danger" />
              Código para cancelar
            </p>
            <button
              type="button"
              onClick={() => setShowCancel((value) => !value)}
              className="press inline-flex h-9 items-center gap-1.5 rounded-btn px-2.5 text-sm font-medium text-[#6B7076] hover:bg-suya-mist/60"
            >
              {showCancel ? (
                <>
                  <EyeOff aria-hidden="true" className="h-4 w-4" />
                  Ocultar
                </>
              ) : (
                <>
                  <Eye aria-hidden="true" className="h-4 w-4" />
                  Mostrar
                </>
              )}
            </button>
          </div>
          <p className="mt-1 font-display text-2xl font-bold tracking-[0.35em]">
            {showCancel ? order.cancelCode : '••••'}
          </p>
          <p className="mt-1 text-sm text-[#6B7076]">
            Se pide al cancelar, para que ningún toque accidental anule tu pedido.
          </p>
        </div>
      )}
    </div>
  );
}
