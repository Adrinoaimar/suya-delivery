import { useEffect, useState } from 'react';
import { CreditCard, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/common/Card';
import type { IzipayPaymentSession } from '@/lib/payments/izipay';

type CheckoutState = 'loading' | 'ready' | 'response' | 'error';

let sdkPromise: Promise<void> | null = null;

function sdkUrl(): string {
  return import.meta.env.VITE_IZIPAY_ENVIRONMENT === 'production'
    ? 'https://checkout.izipay.pe/payments/v1/js/index.js'
    : 'https://sandbox-checkout.izipay.pe/payments/v1/js/index.js';
}

function loadSdk(): Promise<void> {
  if (window.Izipay) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('izipay-web-sdk') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('No pudimos cargar el checkout Izipay.')),
        { once: true },
      );
      return;
    }
    const script = document.createElement('script');
    script.id = 'izipay-web-sdk';
    script.src = sdkUrl();
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No pudimos cargar el checkout Izipay.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

interface IzipayCheckoutProps {
  session: IzipayPaymentSession;
}

/** Izipay procesa el intento; estado final siempre llega por webhook al backend. */
export function IzipayCheckout({ session }: IzipayCheckoutProps) {
  const checkoutSession = session.izipaySession;
  const [state, setState] = useState<CheckoutState>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadSdk()
      .then(() => {
        if (!active || !window.Izipay) throw new Error('El checkout Izipay no está disponible.');
        const checkout = new window.Izipay({ config: checkoutSession });
        checkout.LoadForm({
          authorization: checkoutSession.authorization,
          keyRSA: checkoutSession.keyRSA,
          callbackResponse: () => {
            if (active) setState('response');
          },
        });
        if (active) setState('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'No pudimos abrir Izipay.');
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [checkoutSession]);

  return (
    <Card className="border-suya-green/30 bg-suya-lime-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-suya-green shadow-sm">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold">Paga con QR Izipay</h2>
          <p className="mt-1 text-sm text-[#4A4F55]">
            Escanea el QR desde tu billetera. No cierres esta pantalla hasta terminar.
          </p>
        </div>
      </div>
      <div
        id={`izipay-checkout-${session.paymentIntent.attemptId}`}
        className="mt-4 min-h-24 rounded-btn bg-white p-3"
      />
      <p className="mt-3 flex items-center gap-1.5 text-xs text-[#5E6A62]" aria-live="polite">
        {state === 'loading' && (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        )}
        {state === 'response' && (
          <ShieldCheck className="h-3.5 w-3.5 text-suya-green" aria-hidden="true" />
        )}
        {error ??
          (state === 'loading'
            ? 'Cargando checkout seguro…'
            : state === 'response'
              ? 'Respuesta recibida. Suya confirmará el pago cuando llegue el webhook seguro.'
              : 'Checkout seguro activo. La confirmación final depende del servidor.')}
      </p>
    </Card>
  );
}
