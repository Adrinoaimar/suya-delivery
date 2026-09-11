import { Bike, Clock, Heart, MapPin, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/common/Badge';
import { Thumb } from '@/components/common/Thumb';
import { cn } from '@/lib/cn';
import { useUserStore } from '@/store/userStore';
import { formatDistance, formatEta, formatPrice } from '@/utils/format';
import { isInformationalStore, isStoreAcceptingOrders } from '@/utils/schedule';
import type { Store } from '@/types';

interface StoreCardProps {
  store: Store;
  layout?: 'grid' | 'row';
  className?: string;
}

/** Activos propios de la demo cuando el backend todavía no tiene logo publicado. */
const BRAND_ASSET_FALLBACKS: Record<string, string> = {
  'anda-paya': '/brand/stores/anda-paya.svg',
};

/** Dato operativo suelto: se lee de un vistazo, sin cadenas separadas por puntos. */
function MetaPill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="suya-pill-meta inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-suya-carbon">
      {icon}
      {children}
    </span>
  );
}

export function StoreCard({ store, layout = 'grid', className }: StoreCardProps) {
  const favorites = useUserStore((state) => state.favorites);
  const toggleFavorite = useUserStore((state) => state.toggleFavorite);
  const isFavorite = favorites.includes(store.id);
  const informationalOnly = isInformationalStore(store);
  const open = isStoreAcceptingOrders(store);
  const normalizedName = store.name.trim().toLocaleLowerCase('es-PE');
  const demoFallback = normalizedName === 'andá paya' ? BRAND_ASSET_FALLBACKS['anda-paya'] : undefined;
  const visualSrc = store.image || store.logo || demoFallback || BRAND_ASSET_FALLBACKS[store.id] || null;
  const visualFit = store.image ? 'cover' : 'contain';
  const compactLogo = layout === 'grid' && !store.image && Boolean(visualSrc);
  const stacked = layout === 'grid' && !compactLogo;
  const hasRating = store.rating > 0 && store.reviews !== 0;

  return (
    <article
      className={cn(
        'suya-lens-raised motion-press group relative overflow-hidden rounded-promo p-2 transition-[transform,box-shadow] duration-300 ease-out motion-safe:active:scale-[0.985] motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-soft',
        !stacked && 'flex',
        className,
      )}
    >
      <div
        className={cn(
          'relative shrink-0 overflow-hidden rounded-card bg-suya-ivory',
          compactLogo
            ? 'min-h-[148px] w-[116px] sm:min-h-40 sm:w-36'
            : stacked
              ? 'h-36 w-full sm:h-44'
              : 'min-h-32 w-32',
        )}
      >
        <Thumb
          name={store.name}
          src={visualSrc}
          variant="store"
          fit={visualFit}
          rounded="rounded-none"
          textClassName={stacked ? 'text-3xl' : 'text-2xl'}
        />

        {!open && (
          <div className="absolute inset-0 flex items-center justify-center bg-suya-carbon/55">
            <span className="suya-lens-chip rounded-full px-3 py-1.5 text-xs font-semibold text-suya-carbon">
              {informationalOnly ? 'Carta informativa' : 'Cerrado ahora'}
            </span>
          </div>
        )}

        {store.promoLabel && open && (
          <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)]">
            <Badge tone="sun" className="border border-white/60 shadow-card">
              {store.promoLabel}
            </Badge>
          </span>
        )}

        {/* La calificación va sobre la foto: es el dato que decide la elección. */}
        {hasRating && stacked && (
          <span
            className="suya-pill-media absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold"
            aria-label={`Calificación ${store.rating.toFixed(1)} de 5${store.reviews ? `, ${store.reviews} reseñas` : ''}`}
          >
            <Star aria-hidden="true" className="h-3.5 w-3.5 fill-suya-sun text-suya-sun" />
            <span className="tabular-nums">{store.rating.toFixed(1)}</span>
            {store.reviews !== undefined && (
              <span className="font-normal text-white/70">({store.reviews})</span>
            )}
          </span>
        )}

        {stacked && (
          <button
            type="button"
            onClick={() => toggleFavorite(store.id)}
            aria-label={
              isFavorite ? `Quitar ${store.name} de favoritos` : `Guardar ${store.name} en favoritos`
            }
            aria-pressed={isFavorite}
            className="suya-pill-media absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95"
          >
            <Heart
              aria-hidden="true"
              className={cn('h-[17px] w-[17px]', isFavorite && 'fill-suya-danger text-suya-danger')}
            />
          </button>
        )}
      </div>

      <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-3 pb-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold leading-snug tracking-[-0.02em]">
              <Link to={`/store/${store.id}`} className="after:absolute after:inset-0">
                {store.name}
              </Link>
            </h3>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-suya-muted">
              {hasRating && !stacked && (
                <span className="inline-flex items-center gap-1 font-semibold text-suya-carbon">
                  <Star aria-hidden="true" className="h-3.5 w-3.5 fill-suya-sun text-suya-sun" />
                  <span className="tabular-nums">{store.rating.toFixed(1)}</span>
                </span>
              )}
              {hasRating ? store.tags[0] : `${store.tags[0]} · Sin reseñas`}
            </p>
          </div>

          {!stacked && (
            <button
              type="button"
              onClick={() => toggleFavorite(store.id)}
              aria-label={
                isFavorite
                  ? `Quitar ${store.name} de favoritos`
                  : `Guardar ${store.name} en favoritos`
              }
              aria-pressed={isFavorite}
              className="suya-lens-chip relative z-10 -mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-suya-muted transition-[color,background-color,transform] hover:bg-white active:scale-95"
            >
              <Heart
                className={cn('h-[18px] w-[18px]', isFavorite && 'fill-suya-danger text-suya-danger')}
              />
            </button>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-0.5">
          {informationalOnly ? (
            <MetaPill icon={<Clock aria-hidden="true" className="h-3.5 w-3.5" />}>
              Datos por confirmar
            </MetaPill>
          ) : (
            <>
              <MetaPill icon={<Clock aria-hidden="true" className="h-3.5 w-3.5" />}>
                {formatEta(store.etaMin, store.etaMax)}
              </MetaPill>
              <MetaPill icon={<Bike aria-hidden="true" className="h-3.5 w-3.5" />}>
                {store.deliveryFee === 0 ? 'Envío gratis' : formatPrice(store.deliveryFee)}
              </MetaPill>
              <MetaPill icon={<MapPin aria-hidden="true" className="h-3.5 w-3.5" />}>
                {formatDistance(store.distanceKm)}
              </MetaPill>
            </>
          )}
        </div>

        {store.isLocal && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-suya-lime-soft px-2 py-0.5 text-[11px] font-semibold text-suya-green-dark">
            Negocio de Sullana
          </span>
        )}
      </div>
    </article>
  );
}
