import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import { notificationService } from '@/lib/services';
import type { NotificationLevel } from '@/lib/services';
import { useUiStore } from '@/store/uiStore';
import { cn } from '@/lib/cn';

const ICONS: Record<NotificationLevel, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: ShieldAlert,
};

const TONES: Record<NotificationLevel, string> = {
  info: 'border-suya-mist bg-white text-suya-carbon',
  success: 'border-suya-green bg-suya-green text-white',
  warning: 'border-suya-sun bg-suya-sun text-suya-carbon',
  danger: 'border-suya-danger bg-suya-danger text-white',
};

/** Región de toasts. Se monta una sola vez en el layout raíz. */
export function ToastViewport() {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);
  const pushToast = useUiStore((state) => state.pushToast);

  useEffect(() => notificationService.subscribe(pushToast), [pushToast]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+16px)] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.level];
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-btn border px-3.5 py-3 shadow-soft animate-slide-up',
              TONES[toast.level],
            )}
          >
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 rounded-full p-1 hover:bg-black/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
