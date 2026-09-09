import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  className?: string;
  padded?: boolean;
  variant?: 'default' | 'glass';
  children: ReactNode;
}

export function Card({ className, padded = true, variant = 'default', children }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card',
        variant === 'glass' ? 'suya-lens' : 'border border-suya-border bg-white/90 shadow-card',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
  subtitle?: string;
  className?: string;
}

export function SectionHeader({ title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="mt-0.5 max-w-[70ch] text-sm text-suya-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
