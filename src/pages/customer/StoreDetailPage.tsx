import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  Bike,
  Clock,
  Heart,
  Info,
  MapPin,
  ShoppingBag,
  Store as StoreIcon,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/common/Badge';
import { ButtonLink } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Rating } from '@/components/common/Rating';
import { ProductRowSkeleton, Skeleton } from '@/components/common/Skeleton';
import { Thumb } from '@/components/common/Thumb';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { ProductSheet } from '@/components/marketplace/ProductSheet';
import { StoreGallery } from '@/components/marketplace/StoreGallery';
import { FREE_DELIVERY_THRESHOLD } from '@/data';
import { cn } from '@/lib/cn';
import { useCatalogStore } from '@/store/catalogStore';
import { cartTotals, useCartStore } from '@/store/cartStore';
import { useUserStore } from '@/store/userStore';
import { assetUrl } from '@/utils/asset';
import { formatEta, formatPrice } from '@/utils/format';
import { isOpenNow, scheduleLabel } from '@/utils/schedule';
import type { Product, Store } from '@/types';

/**
 * Variables CSS con la paleta del negocio. Solo se usan dentro de esta página: el resto
 * de la aplicación (carrito, checkout, navegación) siempre conserva la identidad Suya.
 */
function themeStyle(theme: Store['theme']): CSSProperties | undefined {
  if (!theme) return undefined;
  return {
    '--store-primary': theme.primary,
    '--store-accent': theme.accent,
    '--store-surface': theme.surface,
    '--store-on-primary': theme.onPrimary,
  } as CSSProperties;
}

export default function StoreDetailPage() {
  const { id = '' } = useParams();
  const store = useCatalogStore((state) => state.stores.find((entry) => entry.id === id));
  const storesStatus = useCatalogStore((state) => state.storesStatus);
  const storesError = useCatalogStore((state) => state.storesError);
  const productsData = useCatalogStore((state) => state.productsByStore[id]);
  const productsStatus = useCatalogStore((state) => state.productsStatus[id] ?? 'idle');
  const productsError = useCatalogStore((state) => state.productsError[id] ?? null);
  const loadStores = useCatalogStore((state) => state.loadStores);
  const loadProducts = useCatalogStore((state) => state.loadProducts);
  const [selected, setSelected] = useState<Product | null>(null);
  const [section, setSection] = useState<string | null>(null);

  const favorites = useUserStore((state) => state.favorites);
  const toggleFavorite = useUserStore((state) => state.toggleFavorite);
  const items = useCartStore((state) => state.items);
  const cartStoreId = useCartStore((state) => state.storeId);

  useEffect(() => {
    void loadStores();
    void loadProducts(id);
  }, [id, loadStores, loadProducts]);

  if (!store) {
    if (storesError) {
      return (
        <div className="shell py-10">
          <ErrorState
            description={storesError}
            onRetry={() => {
              void loadStores(true);
              void loadProducts(id, true);
            }}
          />
        </div>
      );
    }

    if (storesStatus !== 'ready') {
      return (
        <div className="shell space-y-4 py-10" role="status" aria-busy="true">
          <span className="sr-only">Cargando el negocio…</span>
          <Skeleton className="h-44 w-full rounded-promo sm:h-56" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <ProductRowSkeleton key={index} />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="shell py-10">
        <EmptyState
          icon={<StoreIcon className="h-6 w-6" />}
          title="No encontramos este negocio"
          description="Puede que ya no esté disponible en Suya Delivery."
          action={<ButtonLink to="/stores">Ver todas las tiendas</ButtonLink>}
        />
      </div>
    );
  }

  const products = productsData ?? [];
  const productsLoading = productsStatus !== 'ready' && productsError === null;

  const open = isOpenNow(store.schedule);
  const isFavorite = favorites.includes(store.id);
  const sections = store.sections.filter((name) =>
    products.some((product) => product.section === name),
  );
  const visibleSections = section ? sections.filter((name) => name === section) : sections;
  const totals = cartTotals(items, store, FREE_DELIVERY_THRESHOLD);
  const cartMatchesStore = cartStoreId === store.id && items.length > 0;
  const theme = store.theme;

  return (
    <div style={themeStyle(theme)} className="pb-24 lg:pb-8">
      {/* Hero: con marca propia, el fondo usa la paleta del negocio en vez del genérico. */}
      <div
        className={cn(
          'relative h-44 overflow-hidden sm:h-56 lg:h-64',
          theme ? 'bg-[var(--store-primary)]' : 'bg-suya-ivory',
        )}
      >
        {store.image ? (
          // Foto real del local a sangre; el logotipo ya aparece en la ficha de abajo.
          <img
            src={assetUrl(store.image)}
            alt={`Local de ${store.name}`}
            className="h-full w-full object-cover"
            width={1200}
            height={720}
          />
        ) : theme ? (
          <div className="flex h-full items-center justify-center gap-4 bg-gradient-to-br from-[var(--store-primary)] to-[var(--store-accent)] px-6">
            <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-2 shadow-soft sm:h-28 sm:w-28">
              <Thumb name={store.name} src={store.logo} variant="store" rounded="rounded-full" />
            </span>
            <span className="hidden text-left text-[var(--store-on-primary)] sm:block">
              <span className="block font-display text-3xl font-bold leading-none">
                {store.name}
              </span>
              <span className="mt-1.5 block text-sm opacity-90">{store.tags.join(' · ')}</span>
            </span>
          </div>
        ) : (
          <Thumb
            name={store.name}
            src={store.image}
            variant="store"
            rounded="rounded-none"
            textClassName="text-6xl"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-suya-carbon/70 via-suya-carbon/10 to-transparent"
        />
        <Link
          to="/stores"
          aria-label="Volver a tiendas"
          className="press absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-suya-carbon shadow-card"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <button
          type="button"
          onClick={() => toggleFavorite(store.id)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          className="press absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-suya-carbon shadow-card"
        >
          <Heart className={cn('h-5 w-5', isFavorite && 'fill-suya-danger text-suya-danger')} />
        </button>
      </div>

      <div className="shell">
        {/* Ficha del negocio. `relative z-10`: sin él, el degradado posicionado del hero
            se pinta encima de esta tarjeta y oculta el nombre del negocio. */}
        <section
          className={cn(
            'relative z-10 -mt-10 rounded-card border bg-white p-4 shadow-soft',
            theme ? 'border-[var(--store-primary)]/30' : 'border-suya-mist',
          )}
        >
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-suya-mist">
              <Thumb name={store.name} src={store.logo} variant="store" rounded="rounded-xl" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold leading-tight">{store.name}</h1>
              <p className="mt-0.5 text-sm text-[#6B7076]">{store.tags.join(' · ')}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge tone={open ? 'lime' : 'neutral'}>{open ? 'Abierto' : 'Cerrado'}</Badge>
              {store.isBeta && <Badge tone="green">Beta</Badge>}
            </div>
          </div>

          <p className="mt-3 text-sm text-[#4A4F55]">{store.description}</p>

          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-suya-mist pt-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[#6B7076]">Calificación</dt>
              <dd className="mt-0.5">
                <Rating value={store.rating} reviews={store.reviews} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#6B7076]">Tiempo estimado</dt>
              <dd
                className={cn(
                  'mt-0.5 inline-flex items-center gap-1 font-medium',
                  theme && 'text-[var(--store-primary)]',
                )}
              >
                <Clock
                  aria-hidden="true"
                  className={cn('h-4 w-4', theme ? 'text-[var(--store-primary)]' : 'text-suya-green')}
                />
                {formatEta(store.etaMin, store.etaMax)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#6B7076]">Envío</dt>
              <dd
                className={cn(
                  'mt-0.5 inline-flex items-center gap-1 font-medium',
                  theme && 'text-[var(--store-primary)]',
                )}
              >
                <Bike
                  aria-hidden="true"
                  className={cn('h-4 w-4', theme ? 'text-[var(--store-primary)]' : 'text-suya-green')}
                />
                {formatPrice(store.deliveryFee)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#6B7076]">Horario</dt>
              <dd className="mt-0.5 font-medium">{scheduleLabel(store.schedule)}</dd>
            </div>
          </dl>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-[#6B7076]">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
            {store.address}
          </p>

          {store.promoLabel && (
            <div
              className={cn(
                'mt-3 flex items-center gap-2 rounded-btn px-3 py-2.5',
                theme ? 'bg-[var(--store-surface)]' : 'bg-suya-sun-soft',
              )}
            >
              <Info
                aria-hidden="true"
                className={cn('h-4 w-4 shrink-0', theme ? 'text-[var(--store-primary)]' : 'text-[#8A6100]')}
              />
              <p className="text-sm font-medium text-suya-carbon">{store.promoLabel}</p>
            </div>
          )}

          {store.dataNote && (
            <div className="mt-3 flex items-start gap-2 rounded-btn border border-suya-mist bg-suya-ivory px-3 py-2.5">
              <Info
                aria-hidden="true"
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  theme ? 'text-[var(--store-primary)]' : 'text-suya-green',
                )}
              />
              <p className="text-sm text-[#4A4F55]">{store.dataNote}</p>
            </div>
          )}

          {store.isRealBrand && (
            <p className="mt-3 text-xs text-[#9AA0A6]">
              Marca mostrada sin logotipo oficial. Precios, horarios y promociones son datos de
              demostración.
            </p>
          )}
        </section>

        {store.gallery && <StoreGallery gallery={store.gallery} storeName={store.name} />}

        {/* Categorías internas */}
        <nav
          aria-label="Categorías del negocio"
          className="sticky top-[60px] z-20 -mx-4 bg-suya-ivory/95 px-4 py-3 backdrop-blur lg:top-[72px] lg:mx-0 lg:px-0"
        >
          <div className="hide-scrollbar flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSection(null)}
              aria-pressed={section === null}
              className={cn(
                'press h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                section === null
                  ? theme
                    ? 'border-[var(--store-primary)] bg-[var(--store-primary)] text-[var(--store-on-primary)]'
                    : 'border-suya-green bg-suya-green text-white'
                  : 'border-suya-mist bg-white text-suya-carbon',
              )}
            >
              Todo
            </button>
            {sections.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSection(name)}
                aria-pressed={section === name}
                className={cn(
                  'press h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                  section === name
                    ? theme
                      ? 'border-[var(--store-primary)] bg-[var(--store-primary)] text-[var(--store-on-primary)]'
                      : 'border-suya-green bg-suya-green text-white'
                    : 'border-suya-mist bg-white text-suya-carbon',
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </nav>

        {/* Productos */}
        <div className="space-y-7 pb-6">
          {productsError ? (
            <ErrorState
              title="No pudimos cargar el menú"
              description={productsError}
              onRetry={() => void loadProducts(id, true)}
            />
          ) : productsLoading ? (
            <div className="space-y-3" role="status" aria-busy="true">
              <span className="sr-only">Cargando el menú…</span>
              {Array.from({ length: 4 }).map((_, index) => (
                <ProductRowSkeleton key={index} />
              ))}
            </div>
          ) : (
            visibleSections.map((name) => (
            <section key={name} aria-labelledby={`seccion-${name}`}>
              <h2 id={`seccion-${name}`} className="section-title mb-3">
                {name}
              </h2>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {products
                  .filter((product) => product.section === name)
                  .map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      disabled={!open}
                      onSelect={setSelected}
                      accentClassName={
                        theme
                          ? 'bg-[var(--store-primary)] hover:bg-[var(--store-accent)]'
                          : undefined
                      }
                    />
                  ))}
              </div>
            </section>
            ))
          )}

          {!open && !productsLoading && !productsError && (
            <p className="rounded-card border border-suya-mist bg-white p-4 text-sm text-[#6B7076]">
              Este negocio está cerrado ahora. Su horario es {scheduleLabel(store.schedule)}; podrás
              pedir cuando vuelva a abrir.
            </p>
          )}
        </div>
      </div>

      {/* Barra flotante del carrito */}
      {cartMatchesStore && (
        <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-20 px-4 pb-3 lg:bottom-6">
          <Link
            to="/cart"
            className={cn(
              'press mx-auto flex max-w-md items-center justify-between gap-3 rounded-btn px-4 py-3.5 text-white shadow-soft',
              theme ? 'bg-[var(--store-primary)]' : 'bg-suya-green',
            )}
          >
            <span className="flex items-center gap-2 font-display font-semibold">
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
              Ver carrito ({totals.count})
            </span>
            <span className="font-display font-bold">{formatPrice(totals.total)}</span>
          </Link>
        </div>
      )}

      <ProductSheet product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
