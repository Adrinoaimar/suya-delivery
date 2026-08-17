import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  tone?: 'green' | 'sun';
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  tone = 'green',
  className,
}: ToggleProps) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-3', className)}>
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold text-suya-carbon">{label}</span>
        {description && <span className="text-sm text-[#6B7076]">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? (tone === 'sun' ? 'bg-suya-sun' : 'bg-suya-green') : 'bg-suya-mist',
        )}
      >
        {/* `left-1` ancla el círculo: sin él, el absoluto parte de su posición estática
            y el recorrido se desplaza fuera del interruptor. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-card transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </label>
  );
}
