import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sun';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-suya-green text-white hover:bg-suya-green-dark shadow-card',
  secondary: 'bg-white/90 text-suya-green border border-suya-border hover:bg-white',
  ghost: 'bg-transparent text-suya-carbon hover:bg-suya-mist/65',
  danger: 'bg-suya-danger text-white hover:brightness-95 shadow-card',
  sun: 'bg-suya-sun text-suya-carbon hover:brightness-95 shadow-card',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-12 px-3.5 text-sm',
  md: 'h-12 px-5 text-[15px]',
  lg: 'h-14 px-6 text-base',
};

/** Clases compartidas por `Button` y `ButtonLink`. Altura táctil mínima: 48 px. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth = false,
): string {
  return cn(
    'press inline-flex min-h-12 items-center justify-center gap-2 rounded-btn font-display font-semibold tracking-[-0.01em]',
    'transition-[background-color,border-color,color,transform,box-shadow] duration-150 disabled:cursor-not-allowed disabled:border-suya-mist disabled:bg-suya-mist disabled:text-suya-muted disabled:shadow-none',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
  );
}
