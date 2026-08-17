import { cn } from '@/lib/cn';

interface LogoMarkProps {
  className?: string;
  /** `onDark` invierte la ruta a blanco para usarla sobre el verde de marca. */
  tone?: 'brand' | 'onDark';
  title?: string;
}

/** Símbolo de Suya: la S convertida en ruta, con pin de ubicación y sol. */
export function LogoMark({ className, tone = 'brand', title = 'Suya Delivery' }: LogoMarkProps) {
  const road = tone === 'onDark' ? '#FFFFFF' : '#0E6B44';
  const pin = tone === 'onDark' ? '#FFC107' : '#0E6B44';
  const pinCore = tone === 'onDark' ? '#0E6B44' : '#FFC107';

  return (
    <svg viewBox="0 0 512 512" role="img" aria-label={title} className={cn('h-8 w-8', className)}>
      <title>{title}</title>
      <circle cx="118" cy="104" r="54" fill="#FFC107" opacity={tone === 'onDark' ? 0.85 : 0.92} />
      <path
        d="M345 155 C345 110 285 92 235 108 C180 126 168 196 225 222 C288 250 292 292 265 318"
        fill="none"
        stroke={road}
        strokeWidth="46"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M345 155 C345 110 285 92 235 108 C180 126 168 196 225 222 C288 250 292 292 265 318"
        fill="none"
        stroke="#FFC107"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="18 24"
      />
      <path
        d="M265 306 c-31 0 -56 25 -56 56 0 40 56 92 56 92 s56 -52 56 -92 c0 -31 -25 -56 -56 -56 z"
        fill={pin}
      />
      <circle cx="265" cy="360" r="20" fill={pinCore} />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  tone?: 'brand' | 'onDark';
  showCity?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const TEXT_SIZES = {
  sm: { name: 'text-[19px]', word: 'text-[9px]', city: 'text-[8px]', mark: 'h-8 w-8' },
  md: { name: 'text-2xl', word: 'text-[11px]', city: 'text-[9px]', mark: 'h-10 w-10' },
  lg: { name: 'text-4xl', word: 'text-sm', city: 'text-[11px]', mark: 'h-16 w-16' },
};

/** Logotipo horizontal: símbolo + «Suya / DELIVERY / SULLANA, PERÚ». */
export function Logo({ className, tone = 'brand', showCity = false, size = 'md' }: LogoProps) {
  const sizes = TEXT_SIZES[size];
  const nameColor = tone === 'onDark' ? 'text-white' : 'text-suya-green';
  const wordColor = tone === 'onDark' ? 'text-white/85' : 'text-suya-carbon';
  const cityColor = tone === 'onDark' ? 'text-white/70' : 'text-[#6B7076]';

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark tone={tone} className={sizes.mark} />
      <span className="flex flex-col leading-none">
        <span className={cn('font-display font-bold tracking-tight', sizes.name, nameColor)}>
          Suya
        </span>
        <span
          className={cn(
            'font-display font-semibold uppercase tracking-[0.32em]',
            sizes.word,
            wordColor,
          )}
        >
          Delivery
        </span>
        {showCity && (
          <span className={cn('mt-1 font-medium uppercase tracking-[0.24em]', sizes.city, cityColor)}>
            Sullana, Perú
          </span>
        )}
      </span>
    </span>
  );
}
