import { useState } from 'react';
import { ClipboardList, MapPin } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Select, Textarea } from '@/components/common/Input';
import { cn } from '@/lib/cn';
import { notificationService } from '@/lib/services';
import { INCIDENT_LABELS, useRiderStore } from '@/store/riderStore';
import { formatDateTime } from '@/utils/format';
import type { IncidentCategory, LatLng } from '@/types';

const OPTIONS = (Object.keys(INCIDENT_LABELS) as IncidentCategory[]).map((key) => ({
  value: key,
  label: INCIDENT_LABELS[key],
}));

interface IncidentFormProps {
  position: LatLng | null;
}

export function IncidentForm({ position }: IncidentFormProps) {
  const incidents = useRiderStore((state) => state.incidents);
  const addIncident = useRiderStore((state) => state.addIncident);

  const [category, setCategory] = useState<IncidentCategory>('zona-insegura');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | undefined>();

  function submit() {
    if (description.trim().length < 10) {
      setError('Describe lo ocurrido con al menos 10 caracteres.');
      return;
    }
    setError(undefined);
    addIncident({ category, description: description.trim(), position });
    setDescription('');
    notificationService.notify('Incidente registrado en este dispositivo', 'success');
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-suya-mist text-[#4A4F55]">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">Reportar incidente</h2>
          <p className="mt-0.5 text-sm text-[#6B7076]">
            Se guarda con fecha, hora y tu ubicación actual, solo en este dispositivo.
          </p>
        </div>
      </div>

      <Select
        label="Categoría"
        value={category}
        options={OPTIONS}
        onChange={(event) => setCategory(event.target.value as IncidentCategory)}
      />

      <Textarea
        label="Descripción"
        rows={3}
        value={description}
        error={error}
        placeholder="Cuenta qué pasó, dónde y si necesitas ayuda."
        onChange={(event) => setDescription(event.target.value)}
      />

      <p className="flex items-center gap-1.5 text-xs text-[#6B7076]">
        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
        {position
          ? `Ubicación automática: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
          : 'Sin ubicación disponible: activa el GPS o el modo simulado.'}
      </p>

      <Button onClick={submit}>Registrar incidente</Button>

      {incidents.length > 0 && (
        <div className="border-t border-suya-mist pt-3">
          <h3 className="font-display text-[15px] font-bold">Incidentes registrados</h3>
          <ul className="mt-2 space-y-2">
            {incidents.slice(0, 5).map((incident) => (
              <li
                key={incident.id}
                className={cn('rounded-btn border border-suya-mist p-3 text-sm')}
              >
                <p className="font-semibold">{INCIDENT_LABELS[incident.category]}</p>
                <p className="mt-0.5 text-[#4A4F55]">{incident.description}</p>
                <p className="mt-1 text-xs text-[#9AA0A6]">
                  {formatDateTime(incident.createdAt)}
                  {incident.position
                    ? ` · ${incident.position.lat.toFixed(4)}, ${incident.position.lng.toFixed(4)}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
