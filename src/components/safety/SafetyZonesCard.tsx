import { AlertTriangle, MapPinned, ShieldCheck } from 'lucide-react';
import {
  SAFETY_ZONE_CATEGORY_DESCRIPTIONS,
  SAFETY_ZONE_CATEGORY_LABELS,
  SAFETY_ZONES,
  type SafetyZoneCategory,
} from '@/data/safetyZones';

const CATEGORY_ORDER: SafetyZoneCategory[] = ['recommended', 'caution', 'avoid'];

const CATEGORY_STYLES: Record<SafetyZoneCategory, string> = {
  recommended: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  caution: 'border-amber-200 bg-amber-50 text-amber-900',
  avoid: 'border-rose-200 bg-rose-50 text-rose-900',
};

/** Orientación operativa; nunca sustituye la evaluación en tiempo real. */
export function SafetyZonesCard() {
  return (
    <section className="rounded-card border border-suya-mist bg-white p-5 shadow-card" aria-labelledby="safety-zones-title">
      <div className="flex items-start gap-3">
        <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-suya-green" aria-hidden="true" />
        <div>
          <h2 id="safety-zones-title" className="font-display text-lg font-bold text-suya-carbon">
            Zonas y rutas de Sullana
          </h2>
          <p className="mt-1 text-sm leading-6 text-suya-slate">
            Consulta la orientación de Operaciones antes de iniciar un viaje. Las categorías se publicarán solo con fuentes locales verificadas.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-btn border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="note">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Esto es una referencia operativa, no un mapa oficial de criminalidad. Verifica el entorno, respeta indicaciones locales y usa Seguridad si necesitas apoyo.
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Categorías de seguridad">
        {CATEGORY_ORDER.map((category) => (
          <div key={category} className={`rounded-btn border p-3 ${CATEGORY_STYLES[category]}`}>
            <p className="text-sm font-bold">{SAFETY_ZONE_CATEGORY_LABELS[category]}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{SAFETY_ZONE_CATEGORY_DESCRIPTIONS[category]}</p>
          </div>
        ))}
      </div>

      {SAFETY_ZONES.length === 0 ? (
        <div className="mt-4 rounded-btn border border-dashed border-suya-mist p-4 text-sm text-suya-slate">
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-suya-green" aria-hidden="true" />
            <p>
              Aún no hay zonas publicadas. Coordinación debe validar nombre, categoría, horario, fuente y fecha de revisión antes de mostrarlas a los repartidores.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {SAFETY_ZONES.map((zone) => (
            <article key={zone.id} className={`rounded-btn border p-4 ${CATEGORY_STYLES[zone.category]}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display font-bold">{zone.name}</h3>
                <span className="shrink-0 text-xs font-semibold">{SAFETY_ZONE_CATEGORY_LABELS[zone.category]}</span>
              </div>
              <p className="mt-1 text-sm">{zone.guidance}</p>
              <p className="mt-2 text-xs opacity-75">Fuente: {zone.source} · Revisada: {zone.verifiedAt}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

