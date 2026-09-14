import type { PaymentIntent, PaymentMethod } from '@/types';

interface CulqiResult {
  id?: string;
  state?: string;
}

interface CulqiError {
  user_message?: string;
  merchant_message?: string;
}

interface CulqiCheckoutInstance {
  token?: CulqiResult;
  order?: CulqiResult;
  error?: CulqiError;
  culqi?: () => void;
  open(): void;
  close(): void;
}

interface CulqiCheckoutConfig {
  settings: {
    title: string;
    currency: 'PEN';
    amount: number;
    order: string;
  };
  client?: { email: string };
  options: {
    lang: 'es';
    installments: boolean;
    modal: boolean;
    paymentMethods: Record<string, boolean>;
    paymentMethodsSort: string[];
  };
  appearance: {
    theme: 'default';
    hiddenCulqiLogo: boolean;
    hiddenBannerContent: boolean;
    hiddenBanner: boolean;
    hiddenToolBarAmount: boolean;
    hiddenEmail: boolean;
    menuType: 'sidebar';
    buttonCardPayText: string;
    defaultStyle: {
      bannerColor: string;
      buttonBackground: string;
      menuColor: string;
      linksColor: string;
      buttonTextColor: string;
      priceColor: string;
    };
  };
}

type CulqiCheckoutConstructor = new (
  publicKey: string,
  config: CulqiCheckoutConfig,
) => CulqiCheckoutInstance;

declare global {
  interface Window {
    CulqiCheckout?: CulqiCheckoutConstructor;
  }
}

const SCRIPT_ID = 'suya-culqi-checkout-custom';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.CulqiCheckout) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://js.culqi.com/checkout-js';
    script.async = true;
    script.onload = () => (
      window.CulqiCheckout
        ? resolve()
        : reject(new Error('Culqi Custom Checkout no cargó correctamente.'))
    );
    script.onerror = () => reject(new Error('No pudimos cargar el checkout seguro de Culqi.'));
    if (!existing) document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

export async function openCulqiCheckout(options: {
  intent: PaymentIntent;
  method: Extract<PaymentMethod, 'card' | 'yape'>;
  customerEmail?: string | null;
  onToken: (tokenId: string) => Promise<void>;
  onOrder: (order: CulqiResult) => void;
  onError: (message: string) => void;
}): Promise<void> {
  const publicKey = import.meta.env.VITE_CULQI_PUBLIC_KEY?.trim();
  if (!publicKey) throw new Error('Culqi no está configurado en esta aplicación.');
  if (!options.intent.providerReference) throw new Error('El checkout aún no tiene orden Culqi.');

  await loadScript();
  const CulqiCheckout = window.CulqiCheckout;
  if (!CulqiCheckout) throw new Error('Culqi Custom Checkout no está disponible.');

  const paymentMethods =
    options.method === 'card'
      ? { tarjeta: true, yape: false, billetera: false, bancaMovil: false, agente: false, cuotealo: false }
      : { tarjeta: false, yape: true, billetera: false, bancaMovil: false, agente: false, cuotealo: false };
  const enabledMethods = Object.entries(paymentMethods)
    .filter(([, enabled]) => enabled)
    .map(([method]) => method);
  const checkout = new CulqiCheckout(publicKey, {
    settings: {
      title: 'Suya Delivery',
      currency: 'PEN',
      amount: Math.round(options.intent.amount * 100),
      order: options.intent.providerReference,
    },
    ...(options.customerEmail?.trim()
      ? { client: { email: options.customerEmail.trim().toLowerCase() } }
      : {}),
    options: {
      lang: 'es',
      installments: false,
      modal: true,
      paymentMethods,
      paymentMethodsSort: enabledMethods,
    },
    appearance: {
      theme: 'default',
      hiddenCulqiLogo: false,
      hiddenBannerContent: false,
      hiddenBanner: false,
      hiddenToolBarAmount: false,
      hiddenEmail: Boolean(options.customerEmail?.trim()),
      menuType: 'sidebar',
      buttonCardPayText: 'Pagar con tarjeta',
      defaultStyle: {
        bannerColor: '#087F5B',
        buttonBackground: '#087F5B',
        menuColor: '#087F5B',
        linksColor: '#087F5B',
        buttonTextColor: '#FFFFFF',
        priceColor: '#153B2E',
      },
    },
  });

  checkout.culqi = () => {
    if (checkout.token?.id) {
      const tokenId = checkout.token.id;
      checkout.close();
      void options.onToken(tokenId);
      return;
    }
    if (checkout.order?.id) {
      const order = checkout.order;
      checkout.close();
      options.onOrder(order);
      return;
    }
    options.onError(
      checkout.error?.user_message ??
        checkout.error?.merchant_message ??
        'Culqi no pudo procesar el intento.',
    );
  };
  checkout.open();
}
