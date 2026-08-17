import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { buttonClasses } from './buttonStyles';
import type { ButtonSize, ButtonVariant } from './buttonStyles';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonClasses(variant, size, fullWidth), className)} {...rest}>
      {children}
    </button>
  );
}

interface ButtonLinkProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
  state?: unknown;
}

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  state,
}: ButtonLinkProps) {
  return (
    <Link to={to} state={state} className={cn(buttonClasses(variant, size, fullWidth), className)}>
      {children}
    </Link>
  );
}
