import { useState } from 'react';
import { CheckCircle2, Siren } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Modal } from '@/components/common/Modal';
import { notificationService, safetyOperationsService } from '@/lib/services';
import { useRiderStore } from '@/store/riderStore';
import { formatDateTime } from '@/utils/format';
import type { LatLng } from '@/types';

interface SosButtonProps {
  position: LatLng | null;
  orderId: string | null;
}

/**
 * Alerta operativa. No contacta automáticamente a policía ni emergencias.
 */
export function SosButton({ position, orderId }: SosButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sosEvents = useRiderStore((state) => state.sosEvents);
  const triggerSos = useRiderStore((state) => state.triggerSos);
  const resolveSos = useRiderStore((state) => state.resolveSos);
  const [submitting, setSubmitting] = useState(false);

  const activeEvent = sosEvents.find((event) => event.resolvedAt === null);

  async function activate() {
    setSubmitting(true);
    try {
      const id = await safetyOperationsService.reportIncident({
        requestId: crypto.randomUUID(), orderId, category: 'otro',
        description: 'SOS activado por el repartidor', position, sos: true,
      });
      const event = triggerSos(position, id);
      setConfirmOpen(false);
      notificationService.notify(
        `Alerta enviada a operaciones a las ${new Date(event.createdAt).toLocaleTimeString('es-PE')}`,
        'danger',
      );
    } catch {
      notificationService.notify('No pudimos enviar SOS. Llama al 105 o 116 si estás en peligro.', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  async function resolve() {
    if (!activeEvent) return;
    setSubmitting(true);
    try {
      if (!await safetyOperationsService.resolveSos(activeEvent.id)) throw new Error('SOS no encontrado');
      resolveSos(activeEvent.id);
      notificationService.notify('Operaciones recibió que estás a salvo', 'success');
    } catch {
      notificationService.notify('No pudimos cerrar la alerta. Contacta a operaciones.', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-3 border-suya-danger/40">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-suya-danger-soft text-suya-danger">
          <Siren className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">Botón de emergencia</h2>
          <p className="mt-0.5 text-sm text-[#6B7076]">
            Activa una alerta visible para tu contacto de confianza. No llama a la policía ni a
            servicios de emergencia.
          </p>
        </div>
      </div>

      {activeEvent ? (
        <div className="rounded-btn border border-suya-danger bg-suya-danger-soft p-3">
          <p className="font-display text-[15px] font-bold text-suya-danger">
            Alerta operativa activa
          </p>
          <p className="mt-0.5 text-sm text-[#4A4F55]">
            Activada el {formatDateTime(activeEvent.createdAt)}.
            Operaciones debe revisar y atender esta alerta.
          </p>
          <Button variant="secondary" size="sm" className="mt-2.5" onClick={() => void resolve()} disabled={submitting}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Estoy bien, avisar a operaciones
          </Button>
        </div>
      ) : (
        <Button variant="danger" size="lg" fullWidth onClick={() => setConfirmOpen(true)}>
          <Siren className="h-5 w-5" aria-hidden="true" />
          SOS
        </Button>
      )}

      {sosEvents.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-[#6B7076]">
            Historial de alertas ({sosEvents.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {sosEvents.map((event) => (
              <li key={event.id} className="text-[#4A4F55]">
                {formatDateTime(event.createdAt)} ·{' '}
                {event.resolvedAt ? 'resuelta' : 'activa'}
                {event.position
                  ? ` · ${event.position.lat.toFixed(4)}, ${event.position.lng.toFixed(4)}`
                  : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="¿Quieres activar una alerta de emergencia?"
        description="La alerta se registra en Suya con hora y ubicación disponible."
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth onClick={() => void activate()} disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar alerta SOS'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[#4A4F55]">
          Esta acción avisa al centro de operaciones de Suya. No llama automáticamente a tu contacto
          ni a emergencias. Si estás en peligro real, llama al <strong>105</strong> (Policía) o al{' '}
          <strong>116</strong> (Bomberos).
        </p>
      </Modal>
    </Card>
  );
}
