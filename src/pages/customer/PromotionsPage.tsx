import { useEffect } from 'react';
import { SectionHeader } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { StoreListSkeleton } from '@/components/common/Skeleton';
import { PromoCard } from '@/components/marketplace/PromoCard';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { promotions } from '@/data';
import { useCatalogStore } from '@/store/catalogStore';

export default function PromotionsPage() {
  const allStores = useCatalogStore((state) => state.stores);
  const storesStatus = useCatalogStore((state) => state.storesStatus);
  const storesError = useCatalogStore((state) => state.storesError);
  const loadStores = useCatalogStore((state) => state.loadStores);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const stores = allStores.filter((store) => store.promoLabel !== null);

  return (
    <div className="shell space-y-6 py-4 lg:py-8">
      <SectionHeader
        title="Promociones"
        subtitle="Beneficios de demostración en negocios de Sullana"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {promotions.map((promotion) => (
          <PromoCard key={promotion.id} promotion={promotion} size="lg" className="w-full" />
        ))}
      </div>

      <section>
        <SectionHeader title="Negocios con promoción activa" />
        {storesError ? (
          <ErrorState description={storesError} onRetry={() => void loadStores(true)} />
        ) : storesStatus !== 'ready' ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">Cargando negocios con promoción…</span>
            <StoreListSkeleton count={4} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-[#9AA0A6]">
        DEMO DATA: cupones, descuentos y condiciones son ficticios y no representan ofertas reales
        de las marcas mencionadas.
      </p>
    </div>
  );
}
