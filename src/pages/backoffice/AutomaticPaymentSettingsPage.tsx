import { useEffect, useMemo, useState } from 'react';
import { PaymentGatewayConfigPanel } from '@/components/payment/PaymentGatewayConfigPanel';
import { storeService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { useBackofficeContextStore } from '@/store/backofficeContextStore';
import type { Store } from '@/types';

export default function PaymentSettingsPage() {
  const identity = useAuthStore((state) => state.identity);
  const restaurantIds = useMemo(() => identity?.restaurantIds ?? [], [identity?.restaurantIds]);
  const isPlatformAdmin = identity?.access.includes('platform_admin') ?? false;
  const [stores, setStores] = useState<Store[]>([]);
  const activeRestaurantId = useBackofficeContextStore((state) => state.activeRestaurantId);
  const setActiveRestaurantId = useBackofficeContextStore((state) => state.setActiveRestaurantId);

  useEffect(() => {
    let active = true;
    void storeService
      .listStores()
      .then((allStores) => {
        if (!active) return;
        const visible = identity
          ? allStores.filter((store) => isPlatformAdmin || restaurantIds.includes(store.id))
          : allStores;
        setStores(visible);
        setActiveRestaurantId((current) =>
          current && visible.some((store) => store.id === current)
            ? current
            : (visible[0]?.id ?? ''),
        );
      })
      .catch(() => {
        if (active) setStores([]);
      });
    return () => {
      active = false;
    };
  }, [identity, isPlatformAdmin, restaurantIds, setActiveRestaurantId]);

  const effectiveRestaurantId = stores.some((s) => s.id === activeRestaurantId)
    ? activeRestaurantId
    : (stores[0]?.id ?? 'tio-jhony');
  const activeStore = stores.find((s) => s.id === effectiveRestaurantId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-suya-green">
            Administración y Seguridad Financiera
          </p>
          <h1 className="font-display text-2xl font-bold">
            Configuración de cobros — SUYA Delivery
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#68716C]">
            Activa la recepción y verificación automática de pagos en la nube, comprueba tus
            credenciales oficiales y gestiona la conciliación sin modificar código.
          </p>
        </div>
        {(isPlatformAdmin || stores.length > 1) && stores.length > 0 && (
          <label className="text-sm font-semibold">
            Restaurante activo
            <select
              aria-label="Restaurante activo para cobros"
              value={effectiveRestaurantId}
              onChange={(event) => setActiveRestaurantId(event.target.value)}
              className="mt-1 block h-11 rounded-btn border border-suya-border bg-white px-3 text-sm font-normal"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <PaymentGatewayConfigPanel
        restaurantId={effectiveRestaurantId}
        restaurantName={activeStore?.name}
        defaultProvider="static_qr"
      />
    </div>
  );
}
