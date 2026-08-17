import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  className?: string;
  padded?: boolean;
  children: ReactNode;
}

export function Card({ className, padded = true, children }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-suya-mist bg-white shadow-card',
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
        {subtitle && <p className="mt-0.5 text-sm text-[#6B7076]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
