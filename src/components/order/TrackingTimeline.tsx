import { Bike, Check, ChefHat, PackageCheck, Receipt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ORDER_FLOW } from '@/types';
import type { Order, OrderStatus } from '@/types';
import { formatTime, orderStatusLabel } from '@/utils/format';

const ICONS: Record<OrderStatus, LucideIcon> = {
  confirmed: Receipt,
  preparing: ChefHat,
  picked_up: PackageCheck,
  on_the_way: Bike,
  delivered: Check,
  cancelled: Check,
};

interface TrackingTimelineProps {
  order: Order;
  compact?: boolean;
}

export function TrackingTimeline({ order, compact = false }: TrackingTimelineProps) {
  const currentIndex = ORDER_FLOW.indexOf(order.status);
  const cancelled = order.status === 'cancelled';

  return (
    <ol className={cn('relative', compact ? 'space-y-3' : 'space-y-4')}>
      {ORDER_FLOW.map((status, index) => {
        const Icon = ICONS[status];
        const done = !cancelled && index <= currentIndex;
        const active = !cancelled && index === currentIndex;
        const event = order.history.find((item) => item.status === status);

        return (
          <li key={status} className="relative flex gap-3">
            {index < ORDER_FLOW.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-[17px] top-9 h-[calc(100%-12px)] w-0.5 rounded-full',
                  done && index < currentIndex ? 'bg-suya-green' : 'bg-suya-mist',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                done
                  ? 'border-suya-green bg-suya-green text-white'
                  : 'border-suya-mist bg-white text-[#9AA0A6]',
                active && 'ring-4 ring-suya-lime/35',
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p
                className={cn(
                  'text-[15px] font-semibold',
                  done ? 'text-suya-carbon' : 'text-[#9AA0A6]',
                )}
              >
                {orderStatusLabel(status)}
              </p>
              {event && (
                <p className="text-xs text-[#6B7076]">{formatTime(event.at)}</p>
              )}
              {active && (
                <p className="text-xs font-medium text-suya-green">En curso</p>
              )}
            </div>
          </li>
        );
      })}

      {cancelled && (
        <li className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-suya-danger bg-suya-danger-soft text-suya-danger">
            <Check aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="pt-1.5">
            <p className="text-[15px] font-semibold text-suya-danger">Pedido cancelado</p>
          </div>
        </li>
      )}
    </ol>
  );
}
