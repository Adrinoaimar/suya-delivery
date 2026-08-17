import { CircleHelp, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IncidentForm } from '@/components/safety/IncidentForm';
import { LocationShareCard } from '@/components/safety/LocationShareCard';
import { SosButton } from '@/components/safety/SosButton';
import { TrustedContactForm } from '@/components/safety/TrustedContactForm';
import { useSharedLocation } from '@/hooks/useSharedLocation';

export default function RiderSafetyPage() {
  const { snapshot } = useSharedLocation();
  const position = snapshot?.position ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="text-white">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-suya-lime" aria-hidden="true" />
          Seguridad en ruta
        </h1>
        <p className="mt-1 text-sm text-white/70">
          Herramientas para que nunca trabajes solo: ubicación compartida, contacto de confianza,
          alerta de emergencia y reporte de incidentes.
        </p>
      </header>

      <div className="space-y-4 text-suya-carbon">
        <LocationShareCard />
        <TrustedContactForm />
        <SosButton position={position} />
        <IncidentForm position={position} />
      </div>

      <Link
        to="/help"
        className="press flex items-center gap-3 rounded-card border border-white/15 bg-white/5 p-4 text-white transition-colors hover:bg-white/10"
      >
        <CircleHelp className="h-5 w-5 text-suya-lime" aria-hidden="true" />
        <span>
          <span className="block font-display text-[15px] font-bold">Centro de ayuda</span>
          <span className="block text-sm text-white/70">
            Preguntas frecuentes y límites de esta demostración.
          </span>
        </span>
      </Link>
    </div>
  );
}
