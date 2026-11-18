import { useState } from 'react';
import { detectStaticQrWalletNetwork } from '@/lib/payments/paymentEngine';
import type { StaticQrWalletNetwork } from '@/lib/payments/paymentEngine';

export type PayerApp = 'yape' | 'plin' | 'lemon' | 'bank';

const PAYER_APPS: Array<{ id: PayerApp; label: string }> = [
  { id: 'yape', label: 'Yape' },
  { id: 'plin', label: 'Plin' },
  { id: 'lemon', label: 'Lemon' },
  { id: 'bank', label: 'Otro banco' },
];

const STEPS: Record<PayerApp, string> = {
  yape: 'Abre Yape → Yapear → Escanear QR.',
  plin: 'Abre tu app bancaria con Plin (Interbank, BBVA, Scotiabank…) → Plin → Pagar con QR.',
  lemon: 'Abre Lemon → Escanear QR y paga en soles.',
  bank: 'Abre tu app bancaria → Pagos → Pagar con QR interoperable.',
};

/**
 * Compatibilidad orientativa entre la app del pagador y la red del QR receptor.
 * No está verificada con cada proveedor: si la app no lee el QR, el cliente debe probar con otra.
 */
function compatibilityHint(payer: PayerApp, receiver: StaticQrWalletNetwork): string | null {
  if (payer === 'yape' && (receiver === 'lemon' || receiver === 'izipayya')) {
    return 'Algunas versiones de Yape no leen este QR. Si te marca error, paga desde Plin u otro banco.';
  }
  return null;
}

interface PayerAppGuideProps {
  qrPayload: string;
  amountLabel: string;
  initialPayerApp?: PayerApp;
}

export function PayerAppGuide({
  qrPayload,
  amountLabel,
  initialPayerApp = 'yape',
}: PayerAppGuideProps) {
  const [payer, setPayer] = useState<PayerApp>(initialPayerApp);
  const receiver = detectStaticQrWalletNetwork(qrPayload);
  const hint = compatibilityHint(payer, receiver);

  return (
    <div className="mt-3 rounded-btn border border-suya-border bg-[#F7FAF8] p-3 text-xs">
      <p className="font-semibold text-suya-carbon">¿Desde qué app vas a pagar?</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="App desde la que pagas">
        {PAYER_APPS.map((app) => (
          <button
            key={app.id}
            type="button"
            aria-pressed={payer === app.id}
            onClick={() => setPayer(app.id)}
            className={`min-h-11 rounded-btn border px-2.5 py-1 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-suya-green ${
              payer === app.id
                ? 'border-suya-green bg-suya-lime-soft text-suya-green-dark'
                : 'border-suya-border bg-white text-suya-carbon'
            }`}
          >
            {app.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-suya-muted">
        {STEPS[payer]} Ingresa exactamente <strong>S/ {amountLabel}</strong> y confirma.
      </p>
      {hint && <p className="mt-1 font-medium text-amber-800">{hint}</p>}
    </div>
  );
}
