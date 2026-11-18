import { Capacitor, registerPlugin } from '@capacitor/core';

interface NotificationState {
  enabled: boolean;
}

export const nativeOrderNotifications = registerPlugin<{
  check(): Promise<NotificationState>;
  enable(): Promise<NotificationState>;
  openSettings(): Promise<NotificationState>;
  show(options: { orderId: string; title: string; message: string }): Promise<void>;
  clear(): Promise<void>;
}>('SuyaOrderNotifications');

export function supportsOrderNotifications(): boolean {
  return Capacitor.getPlatform() === 'android' &&
    import.meta.env.VITE_MOBILE_ROLE === 'customer' &&
    Capacitor.isPluginAvailable('SuyaOrderNotifications');
}
