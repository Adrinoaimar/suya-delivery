import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  variant?: 'default' | 'glass';
  children: ReactNode;
}

export function Card({
  className,
  padded = true,
  variant = 'default',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
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
  headingLevel?: 'h1' | 'h2';
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
  headingLevel = 'h2',
}: SectionHeaderProps) {
  const Heading = headingLevel;
  return (
    <div className={cn('mb-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <Heading className="section-title">{title}</Heading>
        {action}
      </div>
      {subtitle && <p className="mt-0.5 max-w-[70ch] text-sm text-suya-muted">{subtitle}</p>}
    </div>
  );
}
