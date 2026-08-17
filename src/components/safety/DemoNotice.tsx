import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface DemoNoticeProps {
  children: ReactNode;
  className?: string;
}

/**
 * Etiqueta visible de limitación. No se oculta lo que la demo no puede hacer:
 * este módulo necesitará un servicio realtime en producción.
 */
export function DemoNotice({ children, className }: DemoNoticeProps) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-btn border border-suya-sun bg-suya-sun-soft p-3 text-sm text-suya-carbon',
        className,
      )}
    >
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#8A6100]" />
      <div className="min-w-0">
        <p className="font-semibold">DEMO LOCAL</p>
        <p className="mt-0.5 text-[#4A4F55]">{children}</p>
      </div>
    </div>
  );
}
