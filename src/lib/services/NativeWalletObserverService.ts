import { registerPlugin } from '@capacitor/core';

interface NativeWalletObserverStatus {
  configured: boolean;
  notificationAccess: boolean;
  role: 'ready' | 'unconfigured' | string;
}

interface NativeWalletObserverPlugin {
  configure(options: { deviceToken: string }): Promise<NativeWalletObserverStatus>;
  sync(): Promise<NativeWalletObserverStatus>;
  clear(): Promise<NativeWalletObserverStatus>;
  getStatus(): Promise<NativeWalletObserverStatus>;
  openNotificationSettings(): Promise<void>;
}

const plugin = registerPlugin<NativeWalletObserverPlugin>('SuyaWalletObserver');

export const nativeWalletObserver = {
  getStatus(): Promise<NativeWalletObserverStatus> {
    return plugin.getStatus();
  },
  configure(deviceToken: string): Promise<NativeWalletObserverStatus> {
    return plugin.configure({ deviceToken });
  },
  sync(): Promise<NativeWalletObserverStatus> {
    return plugin.sync();
  },
  openNotificationSettings(): Promise<void> {
    return plugin.openNotificationSettings();
  },
};

export type { NativeWalletObserverStatus };
