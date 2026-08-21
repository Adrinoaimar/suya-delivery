import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Database } from 'lucide-react';
import { Card } from '@/components/common/Card';

interface BackofficePageProps {
  title: string;
  description: string;
  children?: ReactNode;
}

const backendConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

export function BackofficePage({ title, description, children }: BackofficePageProps) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-[#68716C]">{description}</p>
      </div>

      <Card className="flex items-start gap-3">
        {backendConfigured ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-suya-green" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden="true" />
        )}
        <div>
          <p className="font-semibold">
            {backendConfigured ? 'Backend configurado' : 'Backend pendiente de vinculación'}
          </p>
          <p className="mt-1 text-sm text-[#68716C]">
            {backendConfigured
              ? 'La conexión está configurada. La sesión y los permisos RLS determinarán los datos visibles.'
              : 'No se muestran métricas ni pedidos inventados. Configura las variables públicas de Supabase para continuar.'}
          </p>
        </div>
      </Card>

      {children ?? (
        <Card className="flex min-h-48 flex-col items-center justify-center text-center">
          <Database className="h-8 w-8 text-[#8A938E]" aria-hidden="true" />
          <p className="mt-3 font-semibold">Sin datos operativos disponibles</p>
          <p className="mt-1 max-w-lg text-sm text-[#68716C]">
            Esta vista cargará información real después de autenticar al personal y validar sus permisos.
          </p>
        </Card>
      )}
    </div>
  );
}
