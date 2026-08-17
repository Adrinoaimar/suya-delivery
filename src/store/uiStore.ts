import { create } from 'zustand';
import { createId } from '@/utils/id';
import type { NotificationLevel } from '@/lib/services';

export interface Toast {
  id: string;
  message: string;
  level: NotificationLevel;
}

interface UiState {
  toasts: Toast[];
  cartSheetOpen: boolean;
  pushToast: (message: string, level?: NotificationLevel) => void;
  dismissToast: (id: string) => void;
  setCartSheetOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  cartSheetOpen: false,

  pushToast(message, level = 'info') {
    const toast: Toast = { id: createId('toast'), message, level };
    set({ toasts: [...get().toasts, toast] });
    window.setTimeout(() => {
      set({ toasts: get().toasts.filter((item) => item.id !== toast.id) });
    }, 3200);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },

  setCartSheetOpen(open) {
    set({ cartSheetOpen: open });
  },
}));
