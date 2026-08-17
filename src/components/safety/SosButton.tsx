import { useState } from 'react';
import { CheckCircle2, Siren } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Modal } from '@/components/common/Modal';
import { locationSharingService, notificationService } from '@/lib/services';
import { useRiderStore } from '@/store/riderStore';
import { formatDateTime } from '@/utils/format';
import type { LatLng } from '@/types';

interface SosButtonProps {
  position: LatLng | null;
}

/**
 * Alerta de emergencia en modo demostración.
 * NUNCA contacta automáticamente a la policía ni a servicios de emergencia.
 */
export function SosButton({ position }: SosButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sosEvents = useRiderStore((state) => state.sosEvents);
  const triggerSos = useRiderStore((state) => state.triggerSos);
  const resolveSos = useRiderStore((state) => state.resolveSos);
  const trustedContact = useRiderStore((state) => state.trustedContact);

  const activeEvent = sosEvents.find((event) => event.resolvedAt === null);

  function activate() {
    const event = triggerSos(position);
    locationSharingService.publish({ sos: true });
    setConfirmOpen(false);
    notificationService.notify(
      `Alerta demo activada a las ${new Date(event.createdAt).toLocaleTimeString('es-PE')}`,
      'danger',
    );
  }

  function resolve() {
    if (!activeEvent) return;
    resolveSos(activeEvent.id);
    locationSharingService.publish({ sos: false });
    notificationService.notify('Alerta desactivada', 'success');
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
            Alerta demo activa
          </p>
          <p className="mt-0.5 text-sm text-[#4A4F55]">
            Activada el {formatDateTime(activeEvent.createdAt)}.
            {trustedContact
              ? ` Se marcó como alerta para ${trustedContact.name}.`
              : ' Registra un contacto de confianza para avisar a alguien.'}
          </p>
          <Button variant="secondary" size="sm" className="mt-2.5" onClick={resolve}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Estoy bien, desactivar
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
        description="Modo demostración: se registra la hora y se marca la alerta para tu contacto de confianza dentro de esta demo."
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth onClick={activate}>
              Activar alerta demo
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[#4A4F55]">
          En producción esta acción notificará al centro de operaciones de Suya y a tu contacto de
          confianza. Si estás en peligro real, llama al <strong>105</strong> (Policía) o al{' '}
          <strong>116</strong> (Bomberos).
        </p>
      </Modal>
    </Card>
  );
}
