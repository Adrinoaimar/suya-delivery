import {
  parseWalletNotification,
  type WalletNotificationInput,
  type WalletObservedPayment,
  YAPE_NOTIFICATION_ADAPTER,
} from './walletNotificationAdapters';

export type YapeNotificationInput = WalletNotificationInput;
export type YapeObservedPayment = Omit<WalletObservedPayment, 'provider' | 'source' | 'currency'> & {
  provider: 'yape';
  source: 'yape_notification';
  currency: 'PEN';
};

export function parseYapeNotification(input: YapeNotificationInput): YapeObservedPayment | null {
  return parseWalletNotification(input, [YAPE_NOTIFICATION_ADAPTER]) as YapeObservedPayment | null;
}
