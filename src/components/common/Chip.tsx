import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

export function Chip({ active = false, onClick, className, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'press inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
        active
          ? 'border-suya-green bg-suya-green text-white'
          : 'border-suya-mist bg-white text-suya-carbon hover:border-suya-lime',
        className,
      )}
    >
      {children}
    </button>
  );
}
