import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/common/Badge';
import { Price } from '@/components/common/Price';
import { Thumb } from '@/components/common/Thumb';
import { formatDateTime, orderStatusLabel } from '@/utils/format';
import type { Order } from '@/types';

const TONES = {
  confirmed: 'lime',
  preparing: 'lime',
  picked_up: 'sun',
  on_the_way: 'sun',
  delivered: 'green',
  cancelled: 'danger',
} as const;

interface OrderCardProps {
  order: Order;
}

export function OrderCard({ order }: OrderCardProps) {
  const isActive = order.status !== 'delivered' && order.status !== 'cancelled';
  const to = isActive ? `/orders/${order.id}/track` : `/orders/${order.id}`;

  return (
    <article className="relative flex items-center gap-3 rounded-card border border-suya-mist bg-white p-3.5 shadow-card transition-shadow hover:shadow-soft">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl">
        <Thumb name={order.storeName} variant="store" rounded="rounded-xl" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-display text-[15px] font-bold">
            <Link to={to} className="after:absolute after:inset-0">
              {order.storeName}
            </Link>
          </h3>
          <Badge tone={TONES[order.status]}>{orderStatusLabel(order.status)}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-[#6B7076]">
          #{order.code} · {formatDateTime(order.createdAt)}
        </p>
        <p className="mt-0.5 truncate text-xs text-[#6B7076]">
          {order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Price value={order.total} />
        <ChevronRight aria-hidden="true" className="h-4 w-4 text-[#9AA0A6]" />
      </div>
    </article>
  );
}
