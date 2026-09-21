import { create } from 'zustand';

interface BackofficeContextState {
  activeRestaurantId: string;
  setActiveRestaurantId: (restaurantId: string | ((current: string) => string)) => void;
  reset: () => void;
}

/** Contexto en memoria para que todas las pantallas operativas compartan la misma sede. */
export const useBackofficeContextStore = create<BackofficeContextState>((set) => ({
  activeRestaurantId: '',
  setActiveRestaurantId: (next) =>
    set((state) => ({
      activeRestaurantId: typeof next === 'function' ? next(state.activeRestaurantId) : next,
    })),
  reset: () => set({ activeRestaurantId: '' }),
}));
