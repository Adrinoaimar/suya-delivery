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
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = '¿Qué necesitas hoy?',
  autoFocus = false,
  className,
  label = 'Buscar en Suya Delivery',
}: SearchInputProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit?.();
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn('relative w-full', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8A9097]"
      />
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-btn border border-suya-mist bg-white pl-11 pr-11 text-[15px] text-suya-carbon placeholder:text-[#9AA0A6] focus:border-suya-green focus:outline-none focus:ring-2 focus:ring-suya-lime/50"
      />
      {value.length > 0 && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#6B7076] hover:bg-suya-mist/70"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
