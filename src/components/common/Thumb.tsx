import { useState } from 'react';
import { cn } from '@/lib/cn';
import { assetUrl } from '@/utils/asset';
import { initialsOf } from '@/utils/format';

type ThumbVariant = 'store' | 'product' | 'avatar';
type ThumbFit = 'cover' | 'contain';

const FALLBACK: Record<ThumbVariant, string> = {
  store: assetUrl('/placeholders/store.svg')!,
  product: assetUrl('/placeholders/product.svg')!,
  avatar: assetUrl('/placeholders/avatar.svg')!,
};

/** Paleta determinista para las tarjetas neutras (sin logos de terceros). */
const SURFACES = [
  'bg-suya-lime-soft text-suya-green-dark',
  'bg-suya-sun-soft text-[#8A6100]',
  'bg-[#E7F0EB] text-suya-green',
  'bg-suya-mist text-[#4A4F55]',
];

function surfaceFor(seed: string): string {
  const total = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return SURFACES[total % SURFACES.length]!;
}

interface ThumbProps {
  name: string;
  src?: string | null;
  variant?: ThumbVariant;
  className?: string;
  textClassName?: string;
  rounded?: string;
  /** Ajuste visual para logotipos: conserva el activo completo dentro de la tarjeta. */
  fit?: ThumbFit;
}

/**
 * Imagen del negocio/producto con reserva neutra.
 * Cuando no hay activo oficial se muestra la inicial: nunca se recrea un logotipo ajeno.
 */
export function Thumb({
  name,
  src,
  variant = 'store',
  className,
  textClassName,
  rounded = 'rounded-xl',
  fit = 'cover',
}: ThumbProps) {
  const [failed, setFailed] = useState(false);
  const resolved = assetUrl(src);

  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={name}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn(
          'h-full w-full',
          fit === 'contain' ? 'object-contain p-5' : 'object-cover',
          rounded,
          className,
        )}
      />
    );
  }

  if (failed) {
    return (
      <img
        src={FALLBACK[variant]}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className={cn('h-full w-full object-cover', rounded, className)}
      />
    );
  }

  // Sin activo oficial la reserva se presenta como un medallón de marca: ocupa el
  // mismo espacio que la foto pero se lee como una decisión, no como una imagen rota.
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex h-full w-full items-center justify-center',
        rounded,
        surfaceFor(name),
        className,
      )}
    >
      <span className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-full bg-white/55 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
        <span className={cn('font-display text-xl font-bold tracking-tight', textClassName)}>
          {initialsOf(name)}
        </span>
      </span>
    </div>
  );
}
