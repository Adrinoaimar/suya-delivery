import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * `page` centra el estado en el alto disponible: evita que una pantalla vacía
   * quede pegada a la cabecera con un vacío grande debajo.
   */
  size?: 'inline' | 'page';
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'inline',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'suya-lens-quiet flex flex-col items-center justify-center rounded-card border-dashed px-6 text-center',
        size === 'page' ? 'min-h-[58vh] py-14' : 'py-12',
        className,
      )}
    >
      {icon && (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-suya-lime-soft text-suya-green">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-suya-carbon">{title}</h3>
      {description && (
        <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-suya-muted">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
