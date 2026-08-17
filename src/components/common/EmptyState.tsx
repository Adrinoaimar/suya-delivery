import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-suya-mist bg-white px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-suya-lime-soft text-suya-green">
          {icon}
        </div>
      )}
      <div>
        <h3 className="font-display text-lg font-bold">{title}</h3>
        {description && <p className="mt-1 text-sm text-[#6B7076]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
