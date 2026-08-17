import { createPortal } from 'react-dom';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDialogBehavior } from '@/hooks/useDialog';
import { IconButton } from './IconButton';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'left' | 'right';
  children: ReactNode;
}

export function Drawer({ open, onClose, title, side = 'left', children }: DrawerProps) {
  const titleId = useId();
  const panelRef = useDialogBehavior(open, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
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
        className={cn(
          'absolute inset-y-0 flex w-[84%] max-w-xs flex-col bg-white shadow-soft',
          side === 'left' ? 'left-0' : 'right-0',
        )}
        style={{ animation: 'slide-up 260ms cubic-bezier(0.22,1,0.36,1) forwards' }}
      >
        <div className="flex items-center justify-between border-b border-suya-mist px-4 py-3">
          <h2 id={titleId} className="font-display text-lg font-bold">
            {title}
          </h2>
          <IconButton label="Cerrar" onClick={onClose} className="-mr-2">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
