import { useState } from 'react';
import { CircleAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { Card } from '@/components/common/Card';
import type { LemonPaymentIntent } from '@/lib/payments/lemon';
import { formatPrice } from '@/utils/format';

interface LemonQrPaymentProps {
  qrImage: string;
  amount: number;
  intent?: LemonPaymentIntent;
}

export function LemonQrPayment({ qrImage, amount, intent }: LemonQrPaymentProps) {
  const [imageError, setImageError] = useState(false);
  const isRegistered = Boolean(intent);

  return (
    <Card className="border-[#1B66D1]/30 bg-[#F4F8FF]">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#1B66D1] shadow-sm">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold">Paga con Lemon</h2>
          <p className="mt-1 text-sm text-[#4A4F55]">
            Escanea este QR desde Lemon o desde tu entidad financiera.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-card border border-[#D9E5FA] bg-white p-3 text-center">
        {imageError ? (
          <div
            className="flex min-h-40 items-center justify-center gap-2 text-sm text-red-700"
            role="alert"
          >
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            No pudimos cargar el QR de Lemon.
          </div>
        ) : (
          <img
            src={qrImage}
            alt="Código QR de pago Lemon"
            className="mx-auto max-h-[30rem] w-full max-w-sm object-contain"
            onError={() => setImageError(true)}
          />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-btn bg-white px-3 py-2">
        <span className="text-sm text-[#5E6A62]">Monto a pagar</span>
        <span className="font-display text-lg font-bold">{formatPrice(amount)}</span>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-[#5E6A62]" aria-live="polite">
        {isRegistered ? (
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-suya-green" aria-hidden="true" />
        ) : (
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8A6100]" aria-hidden="true" />
        )}
        {isRegistered
          ? 'Pedido registrado. La notificación del celular de caja quedará como evidencia para revisión.'
          : 'QR de prueba cargado. El pedido aún no tiene intento Lemon registrado en el servidor.'}
      </p>
    </Card>
  );
}
