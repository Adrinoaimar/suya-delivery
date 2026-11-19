import { useEffect, useId, useRef } from 'react';

export type YapeVerificationPhase =
  | 'checking' | 'authorized' | 'code_mismatch' | 'unobserved'
  | 'name_required' | 'review' | 'retry_limit' | 'expired' | 'error';

const COPY: Record<YapeVerificationPhase, [string, string]> = {
  checking: ['Verificando pago', 'Buscamos el abono y el código en Caja.'],
  authorized: ['Código correcto', 'Pago confirmado. Enviamos el pedido al local.'],
  code_mismatch: ['Código incorrecto', 'Revisa los 3 dígitos del comprobante e inténtalo otra vez.'],
  unobserved: ['Aún no encontramos el abono', 'Si ya pagaste, puedes volver a verificar con el mismo código.'],
  name_required: ['Necesitamos el nombre de quien pagó', 'Escribe el nombre que aparece en el comprobante para identificar tu abono.'],
  review: ['Caja debe revisar el pago', 'Conserva el comprobante. Evita repetir el pago.'],
  retry_limit: ['Límite de intentos alcanzado', 'Contacta a Caja con tu comprobante para revisar el pago.'],
  expired: ['El QR venció', 'Si ya pagaste, conserva el comprobante y contacta a Caja.'],
  error: ['No pudimos verificar el pago', 'Revisa tu conexión y vuelve a intentarlo.'],
};

function Skillet() {
  const id = useId();
  const fill = (name: string) => `url(#${id}-${name})`;
  return (
    <svg className="yape-skillet" viewBox="0 0 174 132" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="0.25" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#4c7860" /><stop offset=".42" stopColor="#204b37" /><stop offset="1" stopColor="#0a291d" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x2=".15" y2="1">
          <stop stopColor="#9ab995" /><stop offset=".48" stopColor="#4b775b" /><stop offset="1" stopColor="#1b3e2d" />
        </linearGradient>
        <linearGradient id={`${id}-pepper`} x2=".25" y2="1">
          <stop stopColor="#ffb270" /><stop offset="1" stopColor="#cb6436" />
        </linearGradient>
        <linearGradient id={`${id}-corn`} x2=".25" y2="1">
          <stop stopColor="#ffe69b" /><stop offset="1" stopColor="#e6aa3d" />
        </linearGradient>
        <linearGradient id={`${id}-green`} x2=".15" y2="1">
          <stop stopColor="#adcf70" /><stop offset="1" stopColor="#4e883e" />
        </linearGradient>
        <radialGradient id={`${id}-halo`}>
          <stop stopColor="#d6eac4" /><stop offset="1" stopColor="#eaf4e1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="84" cy="66" r="62" fill={fill('halo')} />
      <ellipse className="yape-skillet-shadow" cx="82" cy="113" rx="55" ry="7" fill="#254f37" opacity=".12" />
      <g className="yape-skillet-body">
        <path d="M112 79 154 59c5-2 8 4 4 7l-45 22Z" fill={fill('steel')} stroke="#173829" strokeWidth="2" />
        <path d="M31 80c4 17 18 27 43 27 26 0 41-9 47-24Z" fill={fill('steel')} stroke="#184030" strokeWidth="2" />
        <ellipse cx="76" cy="80" rx="46" ry="13" fill={fill('rim')} stroke="#345e46" strokeWidth="1.5" />
        <ellipse cx="76" cy="80" rx="40" ry="8.5" fill="#284a37" />
        <path d="M38 83c15 8 60 8 76-1M46 96c7 4 16 5 26 5" fill="none" stroke="#b8d2a9" strokeOpacity=".65" strokeWidth="1.5" strokeLinecap="round" />
        <path d="m65 80 5-4 8 4-5 3Zm16-2 5-2 7 4-8 2Zm14 3 4-4 6 2-5 4Z" fill="#cfad63" opacity=".9" />
      </g>
      <g className="yape-skillet-food yape-skillet-food--left">
        <path d="M53 75c1-8 6-11 13-10l3 6-8 8Z" fill={fill('green')} stroke="#5b8a44" />
        <path d="m55 74 10-8" stroke="#e9f3bb" strokeWidth="1.2" strokeLinecap="round" />
      </g>
      <g className="yape-skillet-food yape-skillet-food--middle">
        <rect x="73" y="69" width="13" height="10" rx="3" fill={fill('corn')} stroke="#dbab4b" transform="rotate(-19 79 74)" />
        <path d="m76 72 5-1" stroke="#fff2c4" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <g className="yape-skillet-food yape-skillet-food--right">
        <path d="m88 76 5-9 10 2-3 10-9 1Z" fill={fill('pepper')} stroke="#c87046" />
        <path d="m94 70 5 1" stroke="#ffd6a1" strokeWidth="1.2" strokeLinecap="round" />
      </g>
      <g className="yape-skillet-steam" fill="none" stroke="#5f8c65" strokeWidth="2" strokeLinecap="round">
        <path d="M61 63c-6-8 9-10 3-19M79 59c-5-8 8-11 4-19M96 62c-5-8 6-10 3-16" />
      </g>
    </svg>
  );
}

export function YapeVerificationFeedback({ phase }: { phase: YapeVerificationPhase }) {
  const panel = useRef<HTMLDivElement>(null);
  const [title, description] = COPY[phase];
  const checking = phase === 'checking';
  const success = phase === 'authorized';
  const mismatch = phase === 'code_mismatch';

  useEffect(() => {
    if (!checking && !success) return;
    const frame = requestAnimationFrame(() => {
      if (panel.current?.scrollIntoView) panel.current.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [checking, success]);

  return (
    <div ref={panel} className="yape-result" data-phase={phase} role="status" aria-atomic="true" aria-busy={checking}>
      <div className="yape-result-copy">
        <svg className="yape-result-icon" viewBox="0 0 52 52" aria-hidden="true">
          <circle className="yape-result-disc" cx="26" cy="26" r="25" />
          <circle className="yape-result-ring" cx="26" cy="26" r="19" fill="none" strokeWidth="2.5" pathLength="100" />
          {!checking && (
            <g key={phase} className="yape-result-mark" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              {success
                ? <path pathLength="1" d="m17.5 26 5.3 5.5 11.7-12" />
                : mismatch
                  ? <><path pathLength="1" d="m20 20 12 12" /><path pathLength="1" d="m32 20-12 12" /></>
                  : <><path pathLength="1" d="M26 18.5v8" /><circle cx="26" cy="32" r="1" fill="currentColor" stroke="none" /></>}
            </g>
          )}
        </svg>
        <div key={phase} className="min-w-0 yape-result-text">
          <p className="font-display text-[15px] font-bold leading-snug sm:text-lg">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-suya-muted sm:text-sm">{description}</p>
        </div>
      </div>
      {success && <Skillet />}
    </div>
  );
}
