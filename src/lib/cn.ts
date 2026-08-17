import clsx from 'clsx';
import type { ClassValue } from 'clsx';

/** Une clases condicionales manteniendo el orden de Tailwind escrito a mano. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
