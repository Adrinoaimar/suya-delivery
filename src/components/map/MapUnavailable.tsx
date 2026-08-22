import { ExternalLink, MapPin, Phone } from 'lucide-react';
import { ExternalButtonLink } from '@/components/common/Button';

interface MapUnavailableProps {
  address: string;
  reference?: string;
  phone?: string;
  audience?: 'customer' | 'rider';
}

/** Fallback honesto: nunca convierte una dirección en coordenadas inventadas. */
export function MapUnavailable({
  address,
  reference,
  phone,
  audience = 'customer',
}: MapUnavailableProps) {
  const query = [address, reference].filter(Boolean).join(', ');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return (
    <div className="flex h-full items-center justify-center bg-suya-ivory p-4 sm:p-6" role="status">
      <div className="w-full max-w-md rounded-card border border-suya-mist bg-white p-4 text-left shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-suya-mist text-suya-green">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] font-bold text-suya-carbon">
              Punto exacto pendiente de confirmar
            </p>
            <p className="mt-1 text-sm leading-5 text-[#4A4F55]">
              {audience === 'rider'
                ? 'No dibujamos una ruta con coordenadas inventadas. Usa la dirección y confirma el punto con el cliente.'
                : 'El repartidor verá la ruta cuando ambos puntos estén confirmados.'}
            </p>
          </div>
        </div>
        <div className="mt-3 rounded-btn bg-suya-ivory px-3 py-2 text-sm text-[#4A4F55]">
          <p>
            <strong>Dirección:</strong> {address}
          </p>
          {reference && (
            <p className="mt-1">
              <strong>Referencia:</strong> {reference}
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ExternalButtonLink
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            variant="ghost"
            size="sm"
            aria-label="Abrir dirección en Google Maps"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Abrir en Maps
          </ExternalButtonLink>
          {phone && (
            <ExternalButtonLink
              href={`tel:${phone.replace(/\s/g, '')}`}
              variant="ghost"
              size="sm"
              aria-label="Llamar para confirmar la dirección"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Confirmar por llamada
            </ExternalButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}
