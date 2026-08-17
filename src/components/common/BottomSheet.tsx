import { createPortal } from 'react-dom';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDialogBehavior } from '@/hooks/useDialog';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Hoja inferior modal, para acciones y detalle en móvil. */
export function BottomSheet({ open, onClose, title, children, footer }: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useDialogBehavior(open, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-suya-carbon/45 animate-fade-in"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-sheet bg-white shadow-sheet animate-sheet-up"
      >
        <div className="flex flex-col items-center px-4 pt-2.5">
          <span aria-hidden="true" className="h-1.5 w-11 rounded-full bg-suya-mist" />
          <h2 id={titleId} className="mt-2.5 w-full font-display text-lg font-bold">
            {title}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">{children}</div>
        {footer && (
          <div className="border-t border-suya-mist px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ExpandableSheetProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Hoja inferior no modal y persistente (seguimiento en móvil): siempre visible,
 * se expande para ver el detalle completo del pedido.
 */
export function ExpandableSheet({
  title,
  expanded,
  onToggle,
  summary,
  children,
  className,
}: ExpandableSheetProps) {
  const contentId = useId();
  return (
    <section
      className={cn(
        'rounded-t-sheet border-t border-suya-mist bg-white shadow-sheet',
        className,
      )}
      aria-label={title}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-full flex-col items-center gap-1.5 rounded-t-sheet px-4 pb-1 pt-2.5"
      >
        <span aria-hidden="true" className="h-1.5 w-11 rounded-full bg-suya-mist" />
        <span className="flex w-full items-center justify-between gap-2">
          <span className="text-left">{summary}</span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-suya-mist/70 text-suya-carbon">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </span>
        </span>
      </button>
      <div
        id={contentId}
        className={cn(
          'overflow-y-auto px-4 transition-[max-height] duration-300',
          expanded ? 'max-h-[52dvh] pb-4 pt-2' : 'max-h-0',
        )}
      >
        {children}
      </div>
    </section>
  );
}
