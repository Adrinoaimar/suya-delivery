import type { PaymentIntent, PaymentMethod } from '@/types';

interface CulqiResult {
  id?: string;
  state?: string;
}

interface CulqiError {
  user_message?: string;
  merchant_message?: string;
}

interface CulqiApi {
  publicKey?: string;
  token?: CulqiResult;
  order?: CulqiResult;
  error?: CulqiError;
  culqi?: () => void;
  settings(options: {
    title: string;
    currency: 'PEN';
    amount: number;
    order: string;
  }): void;
  options(options: {
    lang: 'es';
    installments: boolean;
    paymentMethods: Record<string, boolean>;
    style: { buttonBackground: string; buttonTextColor: string };
  }): void;
  open(): void;
  close(): void;
}

declare global {
  interface Window {
    Culqi?: CulqiApi;
  }
}

const SCRIPT_ID = 'suya-culqi-checkout-v4';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Culqi) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://checkout.culqi.com/js/v4';
    script.async = true;
    script.onload = () => (window.Culqi ? resolve() : reject(new Error('Culqi no cargó correctamente.')));
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
  onToken: (tokenId: string) => Promise<void>;
  onOrder: (order: CulqiResult) => void;
  onError: (message: string) => void;
}): Promise<void> {
  const publicKey = import.meta.env.VITE_CULQI_PUBLIC_KEY?.trim();
  if (!publicKey) throw new Error('Culqi no está configurado en esta aplicación.');
  if (!options.intent.providerReference) throw new Error('El checkout aún no tiene orden Culqi.');

  await loadScript();
  const culqi = window.Culqi;
  if (!culqi) throw new Error('Culqi no está disponible.');

  culqi.publicKey = publicKey;
  culqi.culqi = () => {
    if (culqi.token?.id) {
      const tokenId = culqi.token.id;
      culqi.close();
      void options.onToken(tokenId);
      return;
    }
    if (culqi.order?.id) {
      const order = culqi.order;
      culqi.close();
      options.onOrder(order);
      return;
    }
    options.onError(culqi.error?.user_message ?? culqi.error?.merchant_message ?? 'Culqi no pudo procesar el intento.');
  };
  culqi.settings({
    title: 'Suya Delivery',
    currency: 'PEN',
    amount: Math.round(options.intent.amount * 100),
    order: options.intent.providerReference,
  });
  culqi.options({
    lang: 'es',
    installments: false,
    paymentMethods:
      options.method === 'card'
        ? { tarjeta: true, yape: false, billetera: false, bancaMovil: false, agente: false, cuotealo: false }
        : { tarjeta: false, yape: true, billetera: false, bancaMovil: false, agente: false, cuotealo: false },
    style: { buttonBackground: '#087F5B', buttonTextColor: '#FFFFFF' },
  });
  culqi.open();
}
