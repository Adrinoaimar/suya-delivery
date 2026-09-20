import type { IzipayCheckoutSession } from '@/lib/payments/izipay';

interface IzipayWidget {
  LoadForm(options: {
    authorization: string;
    keyRSA: string;
    callbackResponse: (response: unknown) => void;
  }): void;
}

interface IzipayConstructor {
  new (options: { config: IzipayCheckoutSession }): IzipayWidget;
}

declare global {
  interface Window {
    Izipay?: IzipayConstructor;
  }
}

export {};
