import { useEffect, useState } from 'react';
import { ArrowRight, Heart, Sparkles, Store as StoreIcon, TicketPercent } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Link, useNavigate } from 'react-router-dom';
import { ButtonLink } from '@/components/common/Button';
import { SectionHeader } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { Logo } from '@/components/common/Logo';
import { SearchInput } from '@/components/common/SearchInput';
import { StoreListSkeleton } from '@/components/common/Skeleton';
import { CategoryRail } from '@/components/marketplace/CategoryRail';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { useCatalogStore } from '@/store/catalogStore';
import { offerService } from '@/lib/services';
import type { AppOffer } from '@/types';
import { useCartStore } from '@/store/cartStore';
import { useUserStore } from '@/store/userStore';
import { isStoreAcceptingOrders } from '@/utils/schedule';

export default function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const pushSearch = useUserStore((state) => state.pushSearch);
  const favorites = useUserStore((state) => state.favorites);
  const setOfferCode = useCartStore((state) => state.setOfferCode);
  const [offers, setOffers] = useState<AppOffer[]>([]);

  const stores = useCatalogStore((state) => state.stores);
  const categories = useCatalogStore((state) => state.categories);
  const categoriesStatus = useCatalogStore((state) => state.categoriesStatus);
  const storesStatus = useCatalogStore((state) => state.storesStatus);
  const storesError = useCatalogStore((state) => state.storesError);
  const loadStores = useCatalogStore((state) => state.loadStores);
  const loadCategories = useCatalogStore((state) => state.loadCategories);

  useEffect(() => {
    void loadStores();
    void loadCategories();
  }, [loadStores, loadCategories]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void offerService
      .listActive()
      .then(setOffers)
      .catch(() => setOffers([]));
  }, []);

  const storesLoading = storesStatus === 'idle' || storesStatus === 'loading';
  const categoriesLoading = categoriesStatus === 'idle' || categoriesStatus === 'loading';
  const storesReady = storesStatus === 'ready';
  const featured = stores.filter((store) => store.isFeatured);
  const locals = stores.filter((store) => store.isLocal);
  const recommended = [...stores].sort((a, b) => b.rating - a.rating).slice(0, 4);
  const favoriteStores = stores.filter((store) => favorites.includes(store.id));

  function submitSearch() {
    const term = query.trim();
    if (term.length === 0) {
      navigate('/search');
      return;
    }
    pushSearch(term);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <div className="motion-enter lg:pb-8">
      {/* Hero de escritorio */}
      <section className="hidden px-6 pt-8 lg:block">
        <div className="suya-lens shell grid grid-cols-[0.9fr_1.1fr] items-center gap-10 overflow-hidden rounded-promo px-10 py-12 xl:px-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-suya-lime-soft px-3 py-1 text-xs font-semibold text-suya-green-dark">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Hecho para Sullana
            </span>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05]">
              <span className="block">Todo lo que necesitas,</span>
              <span className="block">de tu ciudad a tu puerta.</span>
            </h1>
            <p className="mt-4 max-w-md text-lg text-suya-muted">
              Restaurantes, tiendas y negocios de Sullana en un solo lugar.
            </p>
            <div className="mt-7 flex gap-3">
              <ButtonLink to="/search" size="lg">
                Pedir ahora
              </ButtonLink>
              <ButtonLink to="/stores" size="lg" variant="secondary">
                Ver tiendas
              </ButtonLink>
            </div>
            <dl className="mt-9 flex gap-8">
              <div>
                <dt className="text-sm text-suya-muted">Negocios</dt>
                <dd className="font-display text-2xl font-bold">
                  {storesReady ? stores.length : '…'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-suya-muted">Canales</dt>
                <dd className="font-display text-2xl font-bold">App y web</dd>
              </div>
              <div>
                <dt className="text-sm text-suya-muted">Cobertura</dt>
                <dd className="font-display text-2xl font-bold">Sullana</dd>
              </div>
            </dl>
          </div>

          {/* Composición: mapa + teléfono + repartidor */}
          <div className="relative h-[380px]">
            <div className="absolute inset-0 overflow-hidden rounded-promo border border-suya-border bg-suya-lime-soft shadow-soft">
              <div
                aria-hidden="true"
                className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/65"
              />
              <div
                aria-hidden="true"
                className="absolute -bottom-20 left-24 h-64 w-64 rounded-full bg-suya-sun-soft/80"
              />
              <div className="relative flex h-full flex-col justify-between p-8">
                <div className="max-w-xs rounded-card border border-suya-border bg-white/90 p-4 shadow-card">
                  <div className="mb-3 rounded-xl border border-suya-mist/70 bg-suya-ivory/75 px-3 py-2">
                    <Logo variant="master" size="sm" className="h-8 max-w-[150px]" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-suya-green">
                    Cobertura inicial
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold">Sullana</p>
                  <p className="mt-1 text-sm text-suya-muted">
                    Ubicación exacta se solicita solo al confirmar un pedido.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm font-semibold text-suya-green-dark">
                  <span className="h-3 w-3 rounded-full bg-suya-green" /> Negocios locales
                  conectados
                </div>
              </div>
            </div>
            <div className="absolute -bottom-2 right-6 w-[212px] overflow-hidden rounded-promo border-[7px] border-suya-carbon bg-white shadow-soft">
              <div className="bg-suya-green px-3 py-2.5 text-white">
                <Logo size="sm" tone="onDark" />
              </div>
              <div className="space-y-2 p-3">
                <div className="rounded-btn bg-suya-lime-soft px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-suya-green-dark">En camino</p>
                  <p className="text-[11px] text-suya-muted">Llega en 12–18 min</p>
                </div>
                <div className="h-2 w-4/5 rounded-full bg-suya-mist" />
                <div className="h-2 w-3/5 rounded-full bg-suya-mist" />
                <div className="flex items-center gap-2 rounded-btn border border-suya-mist p-2">
                  <span className="h-7 w-7 rounded-full bg-suya-sun" aria-hidden="true" />
                  <div className="flex-1 space-y-1">
                    <div className="h-1.5 w-3/4 rounded-full bg-suya-mist" />
                    <div className="h-1.5 w-1/2 rounded-full bg-suya-mist" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="shell space-y-8 pt-5 lg:space-y-10 lg:pt-10">
        {/* Buscador móvil */}
        <section className="lg:hidden">
          <div className="mb-4 px-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-suya-green">
              Descubre Sullana
            </p>
            <h1 className="mt-1 font-display text-[30px] font-bold leading-tight tracking-[-0.045em]">
              Tu ciudad, a un toque.
            </h1>
            <p className="mt-1 text-sm text-suya-muted">Comida y negocios locales cerca de ti.</p>
          </div>
          <SearchInput value={query} onChange={setQuery} onSubmit={submitSearch} />
        </section>

        {/* Sin categorías cargadas el carril quedaría reducido al acceso «Más». */}
        {(categoriesLoading || categories.length > 0) && (
          <section>
            <SectionHeader title="Explora por categoría" />
            <CategoryRail categories={categories} loading={categoriesLoading} />
          </section>
        )}

        {Capacitor.isNativePlatform() && offers.length > 0 && (
          <section aria-label="Ofertas exclusivas de la app">
            <SectionHeader
              title="Ofertas exclusivas de la app"
              subtitle="Beneficios que solo ves aquí"
            />
            <div className="motion-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {offers.map((offer) => (
                <article
                  key={offer.id}
                  className="suya-lens-dark flex flex-col justify-between rounded-promo p-5 text-white"
                >
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-suya-lime">
                      <TicketPercent aria-hidden="true" className="h-3.5 w-3.5" />
                      Exclusiva
                    </p>
                    <h2 className="mt-2 font-display text-lg font-bold">{offer.title}</h2>
                    <p className="mt-1 text-sm text-white/85">{offer.description}</p>
                    <p className="mt-3 font-display text-2xl font-bold">
                      {offer.discountType === 'percent'
                        ? `${offer.discountValue}% menos`
                        : `${offer.discountValue.toFixed(2)} menos`}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-all rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold tracking-wider">
                      {offer.code}
                    </span>
                    <button
                      type="button"
                      className="min-h-12 shrink-0 rounded-btn bg-suya-lime px-4 text-xs font-bold text-suya-green-dark"
                      onClick={() => {
                        setOfferCode(offer.code);
                        navigate(offer.restaurantId ? `/store/${offer.restaurantId}` : '/stores');
                      }}
                    >
                      Usar oferta
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {storesReady && favoriteStores.length > 0 && (
          <section>
            <SectionHeader
              title="Tus favoritos"
              action={
                <Link
                  to="/stores"
                  className="-mr-2 inline-flex min-h-12 items-center gap-1 px-2 text-sm font-semibold text-suya-green"
                >
                  Ver todo <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
            <div className="motion-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {favoriteStores.slice(0, 4).map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader
            title="Tiendas destacadas"
            subtitle="Los favoritos de Sullana esta semana"
            action={
              <Link
                to="/stores"
                className="-mr-2 inline-flex min-h-12 items-center gap-1 px-2 text-sm font-semibold text-suya-green"
              >
                Ver todo <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          />
          {storesError ? (
            <ErrorState description={storesError} onRetry={() => void loadStores(true)} />
          ) : storesLoading ? (
            <div role="status" aria-busy="true">
              <span className="sr-only">Cargando tiendas…</span>
              <StoreListSkeleton count={4} />
            </div>
          ) : (
            <div className="motion-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          )}
        </section>

        {storesReady && stores.length > 1 && (
          <section>
            <SectionHeader
              title="Negocios locales"
              subtitle="Emprendimientos sullaneros en la plataforma"
            />
            <div className="motion-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {locals.map((store) => (
                <StoreCard key={store.id} store={store} layout="row" />
              ))}
            </div>
          </section>
        )}

        {storesReady && stores.length > 1 && (
          <section>
            <SectionHeader
              title="Recomendados para ti"
              subtitle="Mejor calificados y abiertos ahora"
            />
            <div className="motion-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recommended
                .filter((store) => isStoreAcceptingOrders(store))
                .map((store) => (
                  <StoreCard key={store.id} store={store} />
                ))}
            </div>
          </section>
        )}

        {/* Banner editorial */}
        <section className="motion-enter suya-lens-dark overflow-hidden rounded-promo px-5 py-7 text-white sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-lg">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                Compra cerca, recibe rápido
              </span>
              <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
                Apoyamos a los negocios de Sullana
              </h2>
              <p className="mt-2 text-white/85">
                Cada pedido en un comercio local se queda en la ciudad. Suya Delivery conecta a las
                tiendas de tu barrio con tu puerta.
              </p>
            </div>
            <ButtonLink to="/stores" variant="sun" size="lg" className="shrink-0">
              <StoreIcon className="h-4 w-4" aria-hidden="true" />
              Explorar negocios
            </ButtonLink>
          </div>
        </section>
      </div>
    </div>
  );
}
