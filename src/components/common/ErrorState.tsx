import { CloudOff } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/** Mensajes en lenguaje claro: nunca se muestra el error técnico al usuario. */
export function ErrorState({
  title = 'No pudimos cargar esta sección',
  description = 'Revisa tu conexión y vuelve a intentarlo en unos segundos.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-suya-mist bg-white px-6 py-10 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-suya-mist text-[#6B7076]">
        <CloudOff className="h-6 w-6" />
      </div>
      <div>
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="mt-1 text-sm text-[#6B7076]">{description}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Intentar nuevamente
        </Button>
      )}
    </div>
  );
}
