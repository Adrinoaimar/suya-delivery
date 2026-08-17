import { Settings } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Toggle } from '@/components/common/Toggle';
import { riders } from '@/data';
import { notificationService } from '@/lib/services';
import { useRiderStore } from '@/store/riderStore';
import { useUserStore } from '@/store/userStore';

const RIDER = riders[0]!;

export default function RiderSettingsPage() {
  const available = useRiderStore((state) => state.available);
  const setAvailable = useRiderStore((state) => state.setAvailable);
  const simulated = useRiderStore((state) => state.simulatedLocation);
  const setSimulatedLocation = useRiderStore((state) => state.setSimulatedLocation);
  const shareToken = useRiderStore((state) => state.shareToken);
  const regenerateShareToken = useRiderStore((state) => state.regenerateShareToken);
  const preferences = useUserStore((state) => state.preferences);
  const setPreferences = useUserStore((state) => state.setPreferences);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="text-white">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Settings className="h-6 w-6 text-suya-lime" aria-hidden="true" />
          Configuración
        </h1>
      </header>

      <section className="rounded-card bg-white p-4">
        <h2 className="font-display text-[15px] font-bold">Perfil demo</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-[#6B7076]">Nombre</dt>
            <dd className="font-medium">{RIDER.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7076]">Vehículo</dt>
            <dd className="font-medium">{RIDER.vehicle.type}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7076]">Placa</dt>
            <dd className="font-medium tabular-nums">{RIDER.vehicle.plate}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7076]">Verificado</dt>
            <dd className="font-medium">{RIDER.verified ? 'Sí' : 'Pendiente'}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4 rounded-card bg-white p-4">
        <h2 className="font-display text-[15px] font-bold">Preferencias</h2>
        <Toggle
          label="Disponible para pedidos"
          description="Equivale al interruptor del inicio."
          checked={available}
          onChange={setAvailable}
        />
        <Toggle
          label="Modo ubicación simulada"
          description="Usa una ruta demo en lugar del GPS del dispositivo."
          checked={simulated}
          onChange={setSimulatedLocation}
        />
        <Toggle
          label="Reducir animaciones"
          description="Aplica también a la pantalla de carga."
          checked={preferences.reduceMotion}
          onChange={(value) => setPreferences({ reduceMotion: value })}
        />
      </section>

      <section className="rounded-card bg-white p-4">
        <h2 className="font-display text-[15px] font-bold">Enlace de seguimiento</h2>
        <p className="mt-1 text-sm text-[#6B7076]">
          {shareToken
            ? `Token actual: ${shareToken}`
            : 'Todavía no creaste un enlace de seguimiento.'}
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            const token = regenerateShareToken();
            notificationService.notify(`Nuevo enlace: ${token}`, 'success');
          }}
        >
          Generar enlace nuevo
        </Button>
      </section>
    </div>
  );
}
