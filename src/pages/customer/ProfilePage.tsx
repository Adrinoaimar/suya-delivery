import { useEffect, useState } from 'react';
import { Heart, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { Input } from '@/components/common/Input';
import { StoreListSkeleton } from '@/components/common/Skeleton';
import { Toggle } from '@/components/common/Toggle';
import { StoreCard } from '@/components/marketplace/StoreCard';
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

    </div>
  );
}
