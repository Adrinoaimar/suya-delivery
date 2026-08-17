import { useMemo, useState } from 'react';
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
import { Rating } from '@/components/common/Rating';
import { Thumb } from '@/components/common/Thumb';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { ProductSheet } from '@/components/marketplace/ProductSheet';
import { FREE_DELIVERY_THRESHOLD } from '@/data';
import { cn } from '@/lib/cn';
import { storeService } from '@/lib/services';
import { cartTotals, useCartStore } from '@/store/cartStore';
import { useUserStore } from '@/store/userStore';
import { formatEta, formatPrice } from '@/utils/format';
import { isOpenNow, scheduleLabel } from '@/utils/schedule';
import type { Product } from '@/types';

export default function StoreDetailPage() {
  const { id = '' } = useParams();
  const store = useMemo(() => storeService.getStore(id), [id]);
  const products = useMemo(() => storeService.listProducts(id), [id]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [section, setSection] = useState<string | null>(null);

  const favorites = useUserStore((state) => state.favorites);
  const toggleFavorite = useUserStore((state) => state.toggleFavorite);
  const items = useCartStore((state) => state.items);
  const cartStoreId = useCartStore((state) => state.storeId);

  if (!store) {
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

  const open = isOpenNow(store.schedule);
  const isFavorite = favorites.includes(store.id);
  const sections = store.sections.filter((name) =>
    products.some((product) => product.section === name),
  );
  const visibleSections = section ? sections.filter((name) => name === section) : sections;
  const totals = cartTotals(items, store, FREE_DELIVERY_THRESHOLD);
  const cartMatchesStore = cartStoreId === store.id && items.length > 0;

  return (
    <div className="pb-24 lg:pb-8">
      {/* Hero */}
      <div className="relative h-44 overflow-hidden bg-suya-ivory sm:h-56 lg:h-64">
        <Thumb
          name={store.name}
          src={store.image}
          variant="store"
          rounded="rounded-none"
          textClassName="text-6xl"
        />
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
        <section className="relative z-10 -mt-10 rounded-card border border-suya-mist bg-white p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-suya-mist">
              <Thumb name={store.name} src={store.logo} variant="store" rounded="rounded-xl" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold leading-tight">{store.name}</h1>
              <p className="mt-0.5 text-sm text-[#6B7076]">{store.tags.join(' · ')}</p>
            </div>
            <Badge tone={open ? 'lime' : 'neutral'}>{open ? 'Abierto' : 'Cerrado'}</Badge>
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
              <dd className="mt-0.5 inline-flex items-center gap-1 font-medium">
                <Clock aria-hidden="true" className="h-4 w-4 text-suya-green" />
                {formatEta(store.etaMin, store.etaMax)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#6B7076]">Envío</dt>
              <dd className="mt-0.5 inline-flex items-center gap-1 font-medium">
                <Bike aria-hidden="true" className="h-4 w-4 text-suya-green" />
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
            <div className="mt-3 flex items-center gap-2 rounded-btn bg-suya-sun-soft px-3 py-2.5">
              <Info aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8A6100]" />
              <p className="text-sm font-medium text-suya-carbon">{store.promoLabel}</p>
            </div>
          )}

          {store.isRealBrand && (
            <p className="mt-3 text-xs text-[#9AA0A6]">
              Marca mostrada sin logotipo oficial. Precios, horarios y promociones son datos de
              demostración.
            </p>
          )}
        </section>

        {/* Categorías internas */}
        <nav aria-label="Categorías del negocio" className="sticky top-[60px] z-20 -mx-4 bg-suya-ivory/95 px-4 py-3 backdrop-blur lg:top-[72px] lg:mx-0 lg:px-0">
          <div className="hide-scrollbar flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSection(null)}
              aria-pressed={section === null}
              className={cn(
                'press h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                section === null
                  ? 'border-suya-green bg-suya-green text-white'
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
                    ? 'border-suya-green bg-suya-green text-white'
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
          {visibleSections.map((name) => (
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
                    />
                  ))}
              </div>
            </section>
          ))}

          {!open && (
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
            className="press mx-auto flex max-w-md items-center justify-between gap-3 rounded-btn bg-suya-green px-4 py-3.5 text-white shadow-soft"
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
