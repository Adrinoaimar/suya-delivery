import { Capacitor, registerPlugin } from '@capacitor/core';
import type { SupportedStorage } from '@supabase/supabase-js';

interface NativeSecureStoragePlugin {
  getItem(options: { key: string }): Promise<{ value: string | null }>;
  setItem(options: { key: string; value: string }): Promise<void>;
  removeItem(options: { key: string }): Promise<void>;
}

const plugin = registerPlugin<NativeSecureStoragePlugin>('SuyaSecureStorage');

export function usesAndroidSecureStorage(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Supabase Auth storage backed by Android Keystore through the Capacitor bridge. */
export const secureSessionStorage: SupportedStorage = {
  async getItem(key) {
    if (!usesAndroidSecureStorage()) return globalThis.localStorage.getItem(key);
    const result = await plugin.getItem({ key });
    return typeof result.value === 'string' ? result.value : null;
  },
  async setItem(key, value) {
    if (!usesAndroidSecureStorage()) {
      globalThis.localStorage.setItem(key, value);
      return;
    }
    await plugin.setItem({ key, value });
  },
  async removeItem(key) {
    if (!usesAndroidSecureStorage()) {
      globalThis.localStorage.removeItem(key);
      return;
    }
    await plugin.removeItem({ key });
  },
};
