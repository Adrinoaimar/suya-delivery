import { create } from 'zustand';
import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/storage';
import type { UserProfile } from '@/types';

export interface Preferences {
  locationLabel: string;
  reduceMotion: boolean;
  notifications: boolean;
}

const DEFAULT_PROFILE: UserProfile = {
  name: 'Invitado',
  phone: '',
  address: 'Urb. Popular Villa Perú Canadá, Sullana',
  reference: '',
  role: 'customer',
};

const DEFAULT_PREFERENCES: Preferences = {
  locationLabel: 'Sullana, Perú',
  reduceMotion: false,
  notifications: true,
};

export const LOCATION_OPTIONS = [
  'Sullana, Perú',
  'Urb. Popular Villa Perú Canadá',
  'Av. José de Lama',
  'Bellavista, Sullana',
  'Marcavelica, Sullana',
];

interface UserState {
  profile: UserProfile;
  preferences: Preferences;
  favorites: string[];
  recentSearches: string[];
  setProfile: (patch: Partial<UserProfile>) => void;
  setRole: (role: UserProfile['role']) => void;
  setPreferences: (patch: Partial<Preferences>) => void;
  toggleFavorite: (storeId: string) => void;
  pushSearch: (term: string) => void;
  clearSearches: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  profile: readLocal<UserProfile>(STORAGE_KEYS.user, DEFAULT_PROFILE),
  preferences: readLocal<Preferences>(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES),
  favorites: readLocal<string[]>(STORAGE_KEYS.favorites, []),
  recentSearches: readLocal<string[]>(STORAGE_KEYS.recentSearches, []),

  setProfile(patch) {
    const profile = { ...get().profile, ...patch };
    writeLocal(STORAGE_KEYS.user, profile);
    set({ profile });
  },

  setRole(role) {
    const profile = { ...get().profile, role };
    writeLocal(STORAGE_KEYS.user, profile);
    set({ profile });
  },

  setPreferences(patch) {
    const preferences = { ...get().preferences, ...patch };
    writeLocal(STORAGE_KEYS.preferences, preferences);
    set({ preferences });
  },

  toggleFavorite(storeId) {
    const current = get().favorites;
    const favorites = current.includes(storeId)
      ? current.filter((id) => id !== storeId)
      : [...current, storeId];
    writeLocal(STORAGE_KEYS.favorites, favorites);
    set({ favorites });
  },

  pushSearch(term) {
    const clean = term.trim();
    if (clean.length === 0) return;
    const recentSearches = [clean, ...get().recentSearches.filter((item) => item !== clean)].slice(
      0,
      6,
    );
    writeLocal(STORAGE_KEYS.recentSearches, recentSearches);
    set({ recentSearches });
  },

  clearSearches() {
    writeLocal(STORAGE_KEYS.recentSearches, []);
    set({ recentSearches: [] });
  },
}));
