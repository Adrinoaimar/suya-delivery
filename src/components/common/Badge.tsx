import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type BadgeTone = 'green' | 'lime' | 'sun' | 'neutral' | 'danger';

const TONES: Record<BadgeTone, string> = {
  green: 'bg-suya-green text-white',
  lime: 'bg-suya-lime-soft text-suya-green-dark',
  sun: 'bg-suya-sun text-suya-carbon',
  neutral: 'bg-suya-mist text-[#4A4F55]',
  danger: 'bg-suya-danger-soft text-suya-danger',
};

interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

interface CounterBadgeProps {
  count: number;
  pulse?: boolean;
}

export function CounterBadge({ count, pulse = false }: CounterBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full',
        'bg-suya-sun px-1 text-[11px] font-bold text-suya-carbon',
        pulse && 'animate-badge-pulse',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
