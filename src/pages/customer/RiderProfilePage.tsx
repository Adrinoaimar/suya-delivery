import { ArrowLeft, BadgeCheck, Bike, Star } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { RiderCard } from '@/components/rider/RiderCard';
import { Thumb } from '@/components/common/Thumb';
import { riders } from '@/data';

/** Ficha pública del repartidor que el cliente ve durante el seguimiento. */
export default function RiderProfilePage() {
  const { id = '' } = useParams();
  const rider = riders.find((item) => item.id === id);

  if (!rider) {
    return (
      <div className="shell py-10">
        <EmptyState
          icon={<Bike className="h-6 w-6" />}
          title="No encontramos a este repartidor"
          action={<ButtonLink to="/orders">Ver mis pedidos</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="shell max-w-xl space-y-4 py-4 lg:py-8">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7076] hover:text-suya-green"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Mis pedidos
      </Link>

      <Card>
        <div className="flex items-center gap-4">
          <span className="h-20 w-20 shrink-0 overflow-hidden rounded-full">
            <Thumb name={rider.name} src={rider.photo} variant="avatar" rounded="rounded-full" />
          </span>
          <div>
            <h1 className="flex items-center gap-2 font-display text-xl font-bold">
              {rider.name}
              {rider.verified && <BadgeCheck className="h-5 w-5 text-suya-green" aria-label="Verificado" />}
            </h1>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-[#6B7076]">
              <Star className="h-4 w-4 fill-suya-sun text-suya-sun" aria-hidden="true" />
              {rider.rating.toFixed(1)} · {rider.deliveries} entregas
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-suya-mist pt-4 text-sm">
          <div>
            <dt className="text-xs text-[#6B7076]">Vehículo</dt>
            <dd className="font-medium">{rider.vehicle.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7076]">Color</dt>
            <dd className="font-medium">{rider.vehicle.color}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7076]">Placa</dt>
            <dd className="font-medium tabular-nums">{rider.vehicle.plate}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-[15px] font-bold">Contacto</h2>
        <RiderCard rider={rider} compact />
      </Card>

      <p className="text-xs text-[#9AA0A6]">
        DEMO DATA: nombre, calificación, entregas, vehículo y teléfono son ficticios.
      </p>
    </div>
  );
}
