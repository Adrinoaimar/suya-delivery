import { cn } from '@/lib/cn';
import { formatPrice } from '@/utils/format';

interface PriceProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  strikethrough?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'text-sm',
  md: 'text-[15px]',
  lg: 'text-xl',
};

export function Price({ value, size = 'md', strikethrough = false, className }: PriceProps) {
  return (
    <span
      className={cn(
        'font-display font-bold tabular-nums',
        SIZES[size],
        strikethrough ? 'text-[#9AA0A6] line-through' : 'text-suya-carbon',
        className,
      )}
    >
      {formatPrice(value)}
    </span>
  );
}
