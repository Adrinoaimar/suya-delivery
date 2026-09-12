import { CloudOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/** Mensajes en lenguaje claro: nunca se muestra el error técnico al usuario. */
export function ErrorState({
  title = 'No pudimos cargar esta sección',
  description = 'Revisa tu conexión y vuelve a intentarlo en unos segundos.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'suya-lens-quiet flex flex-col items-center rounded-card px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-suya-danger-soft text-suya-danger">
        <CloudOff aria-hidden="true" className="h-7 w-7" />
      </div>
      <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-suya-carbon">{title}</h3>
      <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-suya-muted">{description}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-6">
          Intentar nuevamente
        </Button>
      )}
    </div>
  );
}
