import { useEffect, useState } from 'react';
import { Heart, RefreshCw, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { StoreListSkeleton } from '@/components/common/Skeleton';
import { Toggle } from '@/components/common/Toggle';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { clearSuyaStorage } from '@/lib/storage';
import { notificationService } from '@/lib/services';
import { useCatalogStore } from '@/store/catalogStore';
import { useUserStore } from '@/store/userStore';
import { useAuthStore } from '@/store/authStore';

export default function ProfilePage() {
  const identity = useAuthStore((state) => state.identity);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const preferences = useUserStore((state) => state.preferences);
  const favorites = useUserStore((state) => state.favorites);
  const setPreferences = useUserStore((state) => state.setPreferences);

  const [form, setForm] = useState({
    name: identity?.displayName ?? '',
    phone: identity?.phone ?? '',
    address: identity?.defaultAddress ?? '',
    reference: identity?.defaultReference ?? '',
  });
  const [confirmReset, setConfirmReset] = useState(false);

  const allStores = useCatalogStore((state) => state.stores);
  const storesStatus = useCatalogStore((state) => state.storesStatus);
  const storesError = useCatalogStore((state) => state.storesError);
  const loadStores = useCatalogStore((state) => state.loadStores);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const favoriteStores = allStores.filter((store) => favorites.includes(store.id));

  return (
    <div className="shell space-y-4 py-4 lg:py-8">
      <h1 className="section-title">Mi cuenta</h1>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-suya-lime-soft text-suya-green">
                <User className="h-6 w-6" />
              </span>
              <div>
                <p className="font-display text-lg font-bold">{identity?.displayName}</p>
                <p className="text-sm text-[#6B7076]">{identity?.email}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                label="Nombre"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <Input
                label="Teléfono"
                type="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Dirección"
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Referencia"
                  value={form.reference}
                  onChange={(event) => setForm({ ...form, reference: event.target.value })}
                />
              </div>
            </div>

            <Button
              className="mt-3"
              onClick={() => {
                void updateProfile({
                  displayName: form.name,
                  phone: form.phone,
                  defaultAddress: form.address,
                  defaultReference: form.reference,
                })
                  .then(() => notificationService.notify('Datos guardados', 'success'))
                  .catch(() => notificationService.notify('No pudimos guardar tus datos.', 'danger'));
              }}
            >
              Guardar cambios
            </Button>
          </Card>

        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="font-display text-[15px] font-bold">Preferencias</h2>
            <div className="mt-3 space-y-4">
              <Toggle
                label="Avisos de pedidos"
                description="Muestra un aviso cuando cambie el estado."
                checked={preferences.notifications}
                onChange={(value) => setPreferences({ notifications: value })}
              />
              <Toggle
                label="Reducir animaciones"
                description="Desactiva la animación de entrada y los movimientos."
                checked={preferences.reduceMotion}
                onChange={(value) => setPreferences({ reduceMotion: value })}
              />
            </div>
          </Card>


          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-[15px] font-bold">Datos de la demo</h2>
                <p className="mt-1 text-sm text-[#6B7076]">
                  Todo se guarda solo en este navegador.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-suya-mist px-2.5 py-1 text-[11px] font-semibold text-[#4A4F55]">
                Modo demo local
              </span>
            </div>
            <Button variant="ghost" className="mt-3" onClick={() => setConfirmReset(true)}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reiniciar datos demo
            </Button>
          </Card>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Heart className="h-4 w-4 text-suya-danger" aria-hidden="true" />
          <h2 className="section-title">Favoritos</h2>
        </div>
        {storesError ? (
          <ErrorState description={storesError} onRetry={() => void loadStores(true)} />
        ) : storesStatus !== 'ready' ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">Cargando tus favoritos…</span>
            <StoreListSkeleton count={2} />
          </div>
        ) : favoriteStores.length === 0 ? (
          <p className="rounded-card border border-dashed border-suya-mist bg-white p-5 text-sm text-[#6B7076]">
            Todavía no guardaste negocios. Toca el corazón en cualquier tienda para verla aquí.{' '}
            <Link to="/stores" className="font-semibold text-suya-green">
              Explorar tiendas
            </Link>
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {favoriteStores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        )}
      </section>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="¿Reiniciar los datos de la demo?"
        description="Se borran el carrito, los pedidos, favoritos y la configuración del repartidor guardados en este navegador."
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                clearSuyaStorage();
                // `BASE_URL` respeta la subruta de GitHub Pages; '/' saldría del sitio.
                window.location.href = import.meta.env.BASE_URL;
              }}
            >
              Reiniciar
            </Button>
          </div>
        }
      />
    </div>
  );
}
