import { registerPlugin } from '@capacitor/core';

interface NativeWalletObserverStatus {
  configured: boolean;
  slot?: number;
  notificationAccess: boolean;
  role: 'ready' | 'unconfigured' | string;
  pendingEvents?: number;
  queueFull?: boolean;
  batteryUnrestricted?: boolean;
  rejectedEvents?: number;
  yapeNotificationsSeen?: number;
  lastYapeResult?: string | null;
  lastYapeAt?: string | null;
}

interface NativeWalletObserverPlugin {
  pair(options: { pairingCode: string }): Promise<NativeWalletObserverStatus>;
  sync(): Promise<NativeWalletObserverStatus>;
  clear(): Promise<NativeWalletObserverStatus>;
  getStatus(): Promise<NativeWalletObserverStatus>;
  openNotificationSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
}

const plugin = registerPlugin<NativeWalletObserverPlugin>('SuyaWalletObserver');

export const nativeWalletObserver = {
  getStatus(): Promise<NativeWalletObserverStatus> {
    return plugin.getStatus();
  },
  pair(pairingCode: string): Promise<NativeWalletObserverStatus> {
    return plugin.pair({ pairingCode });
  },
  sync(): Promise<NativeWalletObserverStatus> {
    return plugin.sync();
  },
  clear(): Promise<NativeWalletObserverStatus> {
    return plugin.clear();
  },
  openBatterySettings(): Promise<void> {
    return plugin.openBatterySettings();
  },
  openNotificationSettings(): Promise<void> {
    return plugin.openNotificationSettings();
  },
};

export type { NativeWalletObserverStatus };
