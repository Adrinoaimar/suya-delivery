import { useState } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Toggle } from '@/components/common/Toggle';
import { notificationService, riderOperationsService } from '@/lib/services';
import { useRiderStore } from '@/store/riderStore';
import { useUserStore } from '@/store/userStore';
import { useAuthStore } from '@/store/authStore';

export default function RiderSettingsPage() {
  const available = useRiderStore((state) => state.available);
  const setAvailable = useRiderStore((state) => state.setAvailable);
  const identity = useAuthStore((state) => state.identity);
  const signOut = useAuthStore((state) => state.signOut);
  const preferences = useUserStore((state) => state.preferences);
  const setPreferences = useUserStore((state) => state.setPreferences);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);

  async function changeAvailability(value: boolean): Promise<void> {
    if (availabilityBusy) return;
    setAvailabilityBusy(true);
    try {
      const nextStatus = await riderOperationsService.setAvailability(value);
      const nextAvailable = nextStatus === 'available';
      setAvailable(nextAvailable);
      notificationService.notify(
        nextAvailable ? 'Ahora estás disponible' : 'Ya no recibirás pedidos',
        nextAvailable ? 'success' : 'info',
      );
    } catch (error: unknown) {
      notificationService.notify(
        error instanceof Error ? error.message : 'No pudimos cambiar tu disponibilidad.',
        'danger',
      );
    } finally {
      setAvailabilityBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <header className="text-white">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Settings className="h-6 w-6 text-suya-lime" aria-hidden="true" />
          Configuración
        </h1>
      </header>

      <section className="rounded-card bg-white p-4 text-suya-carbon">
        <h2 className="font-display text-[15px] font-bold">Cuenta de repartidor</h2>
        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[#6B7076]">Nombre</dt>
            <dd className="font-medium">{identity?.displayName ?? 'Repartidor'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7076]">Estado</dt>
            <dd className="font-medium">{available ? 'Disponible' : 'No disponible'}</dd>
          </div>
        </dl>
        <Button className="mt-4" variant="ghost" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Cerrar sesión
        </Button>
      </section>

      <section className="space-y-4 rounded-card bg-white p-4 text-suya-carbon">
        <h2 className="font-display text-[15px] font-bold">Preferencias</h2>
        <Toggle
          label="Disponible para pedidos"
          description={
            availabilityBusy
              ? 'Actualizando tu disponibilidad…'
              : 'Equivale al interruptor del inicio.'
          }
          checked={available}
          disabled={availabilityBusy}
          onChange={(value) => void changeAvailability(value)}
        />
        <Toggle
          label="Reducir animaciones"
          description="Aplica también a la pantalla de carga."
          checked={preferences.reduceMotion}
          onChange={(value) => setPreferences({ reduceMotion: value })}
        />
      </section>
    </div>
  );
}
