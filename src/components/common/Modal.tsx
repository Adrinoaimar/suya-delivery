import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useDialogBehavior } from '@/hooks/useDialog';
import { IconButton } from './IconButton';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Control que recibe el foco al abrir, por ejemplo `'input'`. */
  initialFocusSelector?: string;
  children?: ReactNode;
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  initialFocusSelector,
  children,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useDialogBehavior(open, onClose, initialFocusSelector);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
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
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden bg-white shadow-soft',
          'rounded-t-sheet animate-sheet-up sm:animate-slide-up sm:rounded-card',
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-suya-mist px-4 py-3.5">
          <div>
            <h2 id={titleId} className="font-display text-lg font-bold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-sm text-[#6B7076]">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Cerrar" onClick={onClose} className="-mr-2 -mt-1 shrink-0">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-suya-mist px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
