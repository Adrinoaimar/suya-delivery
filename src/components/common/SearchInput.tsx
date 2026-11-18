import { Search, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { cn } from '@/lib/cn';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  label?: string;
  variant?: 'default' | 'solid';
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = '¿Qué necesitas hoy?',
  autoFocus = false,
  className,
  label = 'Buscar en Suya Delivery',
  variant = 'default',
}: SearchInputProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit?.();
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn('relative w-full', className)}>
      {variant === 'solid' && onSubmit ? (
        <button
          type="submit"
          aria-label="Buscar"
          className="absolute left-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-suya-green hover:bg-suya-lime-soft"
        >
          <Search aria-hidden="true" className="h-5 w-5" />
        </button>
      ) : (
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-suya-muted"
        />
      )}
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'w-full pl-12 pr-12 text-base font-medium text-suya-carbon transition-[border-color,box-shadow,background-color] placeholder:font-normal focus:border-suya-green/60 focus:outline-none focus:ring-2 focus:ring-suya-green/25',
          variant === 'solid'
            ? 'h-[50px] rounded-btn border border-suya-border bg-suya-ivory placeholder:text-suya-muted focus:bg-white'
            : 'suya-lens-raised h-14 rounded-[20px] placeholder:text-suya-muted/65 focus:bg-white/85',
        )}
      />
      {value.length > 0 && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => onChange('')}
          className="absolute right-0 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-suya-muted hover:bg-suya-mist/70"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
