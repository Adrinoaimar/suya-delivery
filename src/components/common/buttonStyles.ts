import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sun';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-suya-green text-white hover:bg-suya-green-dark shadow-card',
  secondary: 'bg-white text-suya-green border border-suya-green hover:bg-suya-lime-soft',
  ghost: 'bg-transparent text-suya-carbon hover:bg-suya-mist/60',
  danger: 'bg-suya-danger text-white hover:brightness-95 shadow-card',
  sun: 'bg-suya-sun text-suya-carbon hover:brightness-95 shadow-card',
};

const SIZES: Record<ButtonSize, string> = {
  // 44 px es el objetivo táctil mínimo declarado en las reglas del proyecto.
  sm: 'h-11 px-3.5 text-sm',
  md: 'h-12 px-5 text-[15px]',
  lg: 'h-14 px-6 text-base',
};

/** Clases compartidas por `Button` y `ButtonLink`. Altura mínima táctil: 40–56 px. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth = false,
): string {
  return cn(
    'press inline-flex items-center justify-center gap-2 rounded-btn font-display font-semibold',
    'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
  );
}
