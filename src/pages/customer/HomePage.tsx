import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, ShoppingBag, TicketPercent } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Link, useNavigate } from 'react-router-dom';
import { SectionHeader } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { SeoHead } from '@/components/common/SeoHead';
import { SearchInput } from '@/components/common/SearchInput';
import { StoreListSkeleton } from '@/components/common/Skeleton';
import { CategoryRail } from '@/components/marketplace/CategoryRail';
import { HomeProductShelf } from '@/components/marketplace/HomeProductShelf';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { HomeBannerPhotos } from '@/components/marketing/HomeBannerPhotos';
import { LocalDeliveryContent } from '@/components/marketing/LocalDeliveryContent';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useCatalogStore } from '@/store/catalogStore';
import { offerService } from '@/lib/services';
import type { AppOffer } from '@/types';
import { assetUrl } from '@/utils/asset';
import { useOrderStore } from '@/store/orderStore';
import { useCartStore } from '@/store/cartStore';
import { useUserStore } from '@/store/userStore';
import { isStoreAcceptingOrders } from '@/utils/schedule';

export default function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const featuredGrid = useRef<HTMLDivElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const compact = useMediaQuery('(max-width: 639px)');
  const pushSearch = useUserStore((state) => state.pushSearch);
  const favorites = useUserStore((state) => state.favorites);
  const setOfferCode = useCartStore((state) => state.setOfferCode);
  const deliveryInTransit = useOrderStore((state) => state.orders.find((order) =>
    order.origin !== 'table_qr' && (order.status === 'picked_up' || order.status === 'on_the_way') &&
    (order.paymentMethod === 'cash' || order.paymentIntent?.status === 'authorized'),
  ));
  const cartCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const cartStoreId = useCartStore((state) => state.storeId);
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
    let active = true;
    void offerService
      .listActive()
      .then((rows) => {
        if (active) setOffers(rows);
      })
      .catch(() => {
        if (active) setOffers([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const storesLoading = storesStatus === 'idle' || storesStatus === 'loading';
  const categoriesLoading = categoriesStatus === 'idle' || categoriesStatus === 'loading';
  const storesReady = storesStatus === 'ready';

  useEffect(() => {
    const grid = featuredGrid.current;
    if (!grid || reduceMotion || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio < 0.18) continue;
        entry.target.setAttribute('data-entered', '');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.18 });

    for (const card of grid.children) {
      if (!card.hasAttribute('data-entered')) observer.observe(card);
    }
    return () => observer.disconnect();
  }, [reduceMotion, stores, storesLoading, storesError]);

  const catalog = stores.filter((store) => !store.isComingSoon);
  const featuredInCatalog = catalog.filter((store) => store.isFeatured);
  const featured = (featuredInCatalog.length > 0 ? featuredInCatalog : catalog)
    .map((store) => ({ store, open: isStoreAcceptingOrders(store) }))
    .sort((a, b) => Number(b.open) - Number(a.open))
    .slice(0, 6)
    .map(({ store }) => store);
  const highlightedIds = new Set(featured.map((store) => store.id));
  const locals = catalog.filter((store) => store.isLocal && !highlightedIds.has(store.id));
  const favoriteStores = stores.filter((store) => favorites.includes(store.id));

  const cartStoreName = cartCount > 0 ? stores.find((store) => store.id === cartStoreId)?.name : undefined;

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
    <>
      <SeoHead
        title="Delivery en Sullana: restaurantes y tiendas | Suya"
        description="Pide comida y compras en restaurantes, tiendas y negocios locales de Sullana. Sigue tu pedido y recibe en tu puerta con Suya Delivery."
        path="/"
        schema={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': 'https://suyadelivery.com/#organization',
              name: 'Suya Delivery',
              url: 'https://suyadelivery.com/',
              logo: 'https://suyadelivery.com/brand/suya-logo.svg',
              description:
                'Plataforma local para pedir comida y compras de negocios incorporados en Sullana, Piura.',
              areaServed: {
                '@type': 'City',
                name: 'Sullana',
                containedInPlace: {
                  '@type': 'AdministrativeArea',
                  name: 'Piura, Perú',
                },
              },
            },
            {
              '@type': 'WebSite',
              '@id': 'https://suyadelivery.com/#website',
              name: 'Suya Delivery',
              url: 'https://suyadelivery.com/',
              inLanguage: 'es-PE',
              publisher: { '@id': 'https://suyadelivery.com/#organization' },
            },
            {
              '@type': 'WebPage',
              '@id': 'https://suyadelivery.com/#webpage',
              url: 'https://suyadelivery.com/',
              name: 'Delivery en Sullana: restaurantes y tiendas',
              description:
                'Pide comida y compras en restaurantes, tiendas y negocios locales de Sullana.',
              isPartOf: { '@id': 'https://suyadelivery.com/#website' },
              about: { '@id': 'https://suyadelivery.com/#service' },
              inLanguage: 'es-PE',
            },
            {
              '@type': 'Service',
              '@id': 'https://suyadelivery.com/#service',
              name: 'Delivery de restaurantes y negocios locales en Sullana',
              serviceType: 'Delivery de comida y compras',
              provider: { '@id': 'https://suyadelivery.com/#organization' },
              areaServed: { '@type': 'City', name: 'Sullana, Piura, Perú' },
              url: 'https://suyadelivery.com/',
            },
          ],
        }}
      />
      <div className="shell space-y-4 pb-7 pt-3 sm:space-y-6 sm:pt-5 lg:pb-12">
        <div className="lg:max-w-2xl">
          <SearchInput
            value={query}
            onChange={setQuery}
            onSubmit={submitSearch}
            placeholder="Busca un negocio o un plato"
            variant="solid"
            className="min-w-0"
          />
        </div>

        {deliveryInTransit && (
          <Link to={`/orders/${deliveryInTransit.id}`} className="motion-enter press flex min-h-16 items-center gap-3 rounded-card bg-suya-green-dark p-3 text-white">
            <img src={assetUrl('/brand/rider.svg')} alt="" width={56} height={44} loading="eager" decoding="async"
              className="h-11 w-14 shrink-0 rounded-xl bg-suya-lime-soft" />
            <span className="min-w-0 flex-1">
              <span className="block font-display font-bold">Seguir mi entrega</span>
              <span className="block truncate text-sm text-white/80">{deliveryInTransit.storeName}</span>
            </span>
            <ArrowRight aria-hidden="true" className="mr-1 h-5 w-5 shrink-0" />
          </Link>
        )}

        {cartCount > 0 && (
          <Link to="/cart" className="motion-enter press flex min-h-16 items-center gap-3 rounded-card border border-suya-green/20 bg-suya-lime-soft p-3 text-suya-green-dark">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-suya-green text-white">
              <ShoppingBag aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display font-bold">Continuar mi pedido</span>
              <span className="block truncate text-sm">{cartCount} {cartCount === 1 ? 'producto' : 'productos'}{cartStoreName && ` · ${cartStoreName}`}</span>
            </span>
            <ArrowRight aria-hidden="true" className="mr-1 h-5 w-5 shrink-0" />
          </Link>
        )}

        <section className="grid min-h-[144px] grid-cols-[1.38fr_1fr] overflow-hidden rounded-promo bg-suya-green-dark text-white sm:min-h-[206px] sm:grid-cols-[1.25fr_1fr]">
          <div className="home-hero-copy flex flex-col items-start justify-center px-4 py-2.5 min-[390px]:px-5 sm:p-7 lg:px-10">
            <h1 className="text-balance font-display text-[24px] font-bold leading-[1.06] tracking-tight text-white sm:max-w-[460px] sm:text-4xl lg:text-[46px]">
              Delivery en Sullana, a un toque.
            </h1>
            <p className="mt-2 hidden text-sm font-medium text-white/90 sm:block sm:text-base">
              Pide a tus restaurantes y negocios locales.
            </p>
            <Link
              to="/stores"
              className="press mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-btn text-[13px] font-bold text-white hover:underline focus-visible:outline-white sm:mt-3 sm:bg-white sm:px-4 sm:text-sm sm:text-suya-green-dark sm:hover:bg-suya-lime-soft sm:hover:no-underline"
            >
              Ver negocios <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <HomeBannerPhotos reduceMotion={reduceMotion} />
        </section>

        <HomeProductShelf />

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

        <section>
          <SectionHeader
            title="Destacados en Sullana"
            className="mb-2"
            action={
              <Link
                to="/stores"
                className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-bold text-suya-green hover:underline"
              >
                Ver todo <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            }
          />
          {(categoriesLoading || categories.length > 0) && (
            <CategoryRail categories={categories} loading={categoriesLoading} className="mb-3" />
          )}
          {storesError ? (
            <ErrorState description={storesError} onRetry={() => void loadStores(true)} />
          ) : storesLoading ? (
            <div role="status" aria-busy="true">
              <span className="sr-only">Cargando negocios…</span>
              <StoreListSkeleton count={3} />
            </div>
          ) : featured.length > 0 ? (
            <div ref={featuredGrid} className="home-featured-grid grid gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {featured.map((store, index) => (
                <StoreCard key={store.id} store={store} layout={compact ? 'row' : 'grid'} priorityImage={index < 2} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-suya-muted">Aún no hay negocios publicados.</p>
          )}
        </section>

        {storesReady && favoriteStores.length > 0 && (
          <section>
            <SectionHeader title="Tus favoritos" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favoriteStores.slice(0, 3).map((store) => (
                <StoreCard key={store.id} store={store} layout={compact ? 'row' : 'grid'} />
              ))}
            </div>
          </section>
        )}

        {storesReady && locals.length > 0 && (
          <section>
            <SectionHeader title="Más negocios de Sullana" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {locals.slice(0, 6).map((store) => (
                <StoreCard key={store.id} store={store} layout="row" />
              ))}
            </div>
          </section>
        )}

        {!Capacitor.isNativePlatform() && (
          <Link
            to="/descargar"
            className="flex min-h-14 items-center gap-3 rounded-btn border border-suya-border bg-suya-ivory px-4 py-2.5 text-sm font-bold text-suya-green hover:bg-suya-lime-soft"
          >
            <Download aria-hidden="true" className="h-5 w-5 shrink-0" />
            Descargar la app de Suya
            <ArrowRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0" />
          </Link>
        )}

        <LocalDeliveryContent />
      </div>
    </>
  );
}
