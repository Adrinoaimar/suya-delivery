import { useEffect, useRef } from 'react';

/**
 * Comportamiento compartido por Modal, Drawer y BottomSheet:
 * bloqueo de scroll, cierre con Escape, foco inicial y devolución del foco al cerrar.
 *
 * El efecto depende solo de `open`: `onClose` vive en una ref para que un re-render
 * (por ejemplo, al escribir en un campo del diálogo) no devuelva el foco al disparador.
 */
export function useDialogBehavior(
  open: boolean,
  onClose: () => void,
  /** Selector del control que debe recibir el foco al abrir (por defecto, el primero). */
  initialFocusSelector?: string,
) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    lastFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const preferred = initialFocusSelector
        ? panelRef.current?.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      const target =
        preferred ??
        panelRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ??
        panelRef.current;
      target?.focus();
    }, 40);

    function focusablesInPanel(): HTMLElement[] {
      if (!panelRef.current) return [];
      return Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = focusablesInPanel();
      if (focusables.length === 0) return;

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      // Si el foco quedó fuera del diálogo, lo devolvemos dentro.
      if (!active || !panelRef.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      window.clearTimeout(focusTimer);
      lastFocused.current?.focus?.();
    };
  }, [open, initialFocusSelector]);

  return panelRef;
}
