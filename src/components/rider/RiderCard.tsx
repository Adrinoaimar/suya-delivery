import { useState } from 'react';
import { BadgeCheck, Copy, MessageCircle, Phone, Star } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Thumb } from '@/components/common/Thumb';
import { notificationService } from '@/lib/services';
import type { Rider } from '@/types';

interface RiderCardProps {
  rider: Rider;
  compact?: boolean;
}

/** Datos DEMO del repartidor. Llamar y mensajear abren un modal con el número de demostración. */
export function RiderCard({ rider, compact = false }: RiderCardProps) {
  const [contactOpen, setContactOpen] = useState<'call' | 'message' | null>(null);

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(rider.phone);
      notificationService.notify('Número copiado', 'success');
    } catch {
      notificationService.notify('No pudimos copiar el número. Cópialo manualmente.', 'warning');
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full">
          <Thumb name={rider.name} src={rider.photo} variant="avatar" rounded="rounded-full" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-[15px] font-bold">
            {rider.name}
            {rider.verified && (
              <BadgeCheck
                aria-label="Repartidor verificado"
                className="h-4 w-4 text-suya-green"
              />
            )}
          </p>
          <p className="flex items-center gap-1 text-xs text-[#6B7076]">
            <Star aria-hidden="true" className="h-3.5 w-3.5 fill-suya-sun text-suya-sun" />
            {rider.rating.toFixed(1)} · {rider.deliveries} entregas
          </p>
          {!compact && (
            <p className="mt-0.5 text-xs text-[#6B7076]">
              {rider.vehicle.type} {rider.vehicle.color.toLowerCase()} · {rider.vehicle.plate}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setContactOpen('call')}
            aria-label={`Llamar a ${rider.name}`}
            className="press flex h-11 w-11 items-center justify-center rounded-full border border-suya-mist text-suya-green hover:bg-suya-lime-soft"
          >
            <Phone className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setContactOpen('message')}
            aria-label={`Enviar mensaje a ${rider.name}`}
            className="press flex h-11 w-11 items-center justify-center rounded-full border border-suya-mist text-suya-green hover:bg-suya-lime-soft"
          >
            <MessageCircle className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <Modal
        open={contactOpen !== null}
        onClose={() => setContactOpen(null)}
        title={contactOpen === 'message' ? `Mensaje a ${rider.name}` : `Llamar a ${rider.name}`}
        description="Modo demostración: no se realiza la llamada ni se envía el mensaje."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setContactOpen(null)}>
              Cerrar
            </Button>
            <Button fullWidth onClick={copyPhone}>
              <Copy className="h-4 w-4" />
              Copiar número
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-card border border-suya-mist bg-suya-ivory p-4 text-center">
            <p className="text-xs uppercase tracking-wider text-[#6B7076]">Número de demostración</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{rider.phone}</p>
          </div>
          <p className="text-sm text-[#6B7076]">
            En producción este botón abrirá la llamada o el chat cifrado con el repartidor sin
            exponer su número personal.
          </p>
        </div>
      </Modal>
    </>
  );
}
