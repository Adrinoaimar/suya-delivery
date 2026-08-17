import { useState } from 'react';
import { cn } from '@/lib/cn';
import { initialsOf } from '@/utils/format';

type ThumbVariant = 'store' | 'product' | 'avatar';

const BASE = import.meta.env.BASE_URL;

const FALLBACK: Record<ThumbVariant, string> = {
  store: `${BASE}placeholders/store.svg`,
  product: `${BASE}placeholders/product.svg`,
  avatar: `${BASE}placeholders/avatar.svg`,
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
}: ThumbProps) {
  const [failed, setFailed] = useState(false);
  // Las rutas de `src/data` se escriben desde la raíz pública; aquí se les antepone la base.
  const resolved = src?.startsWith('/') ? `${BASE}${src.slice(1)}` : src;

  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover', rounded, className)}
      />
    );
  }

  if (failed) {
    return (
      <img
        src={FALLBACK[variant]}
        alt=""
        aria-hidden="true"
        className={cn('h-full w-full object-cover', rounded, className)}
      />
    );
  }

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
      <span className={cn('font-display text-xl font-bold tracking-tight', textClassName)}>
        {initialsOf(name)}
      </span>
    </div>
  );
}
