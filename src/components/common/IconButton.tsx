import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obligatorio: el botón solo muestra un ícono. */
  label: string;
  tone?: 'default' | 'onGreen' | 'danger';
  children: ReactNode;
}

const TONES = {
  default: 'text-suya-carbon hover:bg-suya-mist/70',
  onGreen: 'text-white hover:bg-white/15',
  danger: 'text-suya-danger hover:bg-suya-danger-soft',
};

export function IconButton({
  label,
  tone = 'default',
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'press relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
