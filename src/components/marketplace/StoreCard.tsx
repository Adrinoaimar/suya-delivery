import { Bike, Clock, Heart, MapPin, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Thumb } from '@/components/common/Thumb';
import { cn } from '@/lib/cn';
import { useUserStore } from '@/store/userStore';
import { formatDistance, formatEta, formatPrice } from '@/utils/format';
import { assetUrl } from '@/utils/asset';
import { isInformationalStore, isStoreAcceptingOrders } from '@/utils/schedule';
import type { Store } from '@/types';

interface StoreCardProps {
  store: Store;
  layout?: 'grid' | 'row';
  className?: string;
  priorityImage?: boolean;
}

export function StoreCard({ store, layout = 'grid', className, priorityImage = false }: StoreCardProps) {
  const isFavorite = useUserStore((state) => state.favorites.includes(store.id));
  const toggleFavorite = useUserStore((state) => state.toggleFavorite);
  const informationalOnly = isInformationalStore(store);
  const open = isStoreAcceptingOrders(store);
  const visualSrc = assetUrl(store.image || store.logo || store.gallery?.[0]?.src);
  const logoSrc = assetUrl(store.logo);
  const hasVisualImage = Boolean(store.image || store.gallery?.[0]?.src);
  const stacked = layout === 'grid';
  const hasRating = store.rating > 0 && store.reviews !== 0;
  const availability = store.isComingSoon
    ? 'Próximamente'
    : informationalOnly
      ? 'Carta informativa'
      : !open
        ? 'Cerrado ahora'
        : null;

  return (
    <article
      className={cn(
        'suya-store-card relative isolate overflow-hidden rounded-card border border-suya-border bg-white transition-colors hover:border-suya-green/50 focus-within:ring-2 focus-within:ring-suya-green/35',
        !stacked && 'flex',
        className,
      )}
    >
      <div className={cn('relative shrink-0 overflow-hidden bg-suya-ivory', stacked ? 'aspect-[2.25] w-full' : 'w-[29%] max-w-[132px]')}>
        <Thumb
          name={store.name}
          src={visualSrc}
          variant="store"
          fit={hasVisualImage ? 'cover' : 'contain'}
          priority={priorityImage}
          rounded="rounded-none"
          className={cn(
            hasVisualImage ? 'suya-store-photo' : stacked ? '!p-8 sm:!p-10' : '!p-3',
            !stacked && 'absolute inset-0',
          )}
          textClassName={stacked ? 'text-3xl' : 'text-2xl'}
        />
        {stacked && open && store.promoLabel && (
          <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-4rem)] rounded-md bg-suya-sun-soft px-2 py-1 text-xs font-bold leading-tight text-suya-carbon">
            {store.promoLabel}
          </span>
        )}
      </div>

      <div className={cn('min-w-0 flex-1 p-3', !stacked && 'pr-11')}>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {stacked && hasVisualImage && logoSrc && (
              <img
                src={logoSrc}
                alt={`Logo de ${store.name}`}
                width="36"
                height="36"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-9 w-9 shrink-0 rounded-lg border border-suya-mist bg-white object-contain p-0.5"
              />
            )}
            <div className="min-w-0">
              <h3 className="break-words font-display text-base font-bold leading-snug [text-wrap:initial]">
                <Link to={`/store/${store.id}`} className="after:absolute after:inset-0">
                  {store.name}
                </Link>
              </h3>
              {store.tags[0] && <p className="truncate text-[13px] text-suya-muted">{store.tags[0]}</p>}
            </div>
          </div>
          {hasRating && (
            <span
              className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs font-bold tabular-nums"
              aria-label={`Calificación ${store.rating.toFixed(1)} de 5${store.reviews ? `, ${store.reviews} reseñas` : ''}`}
            >
              <Star aria-hidden="true" className="h-3.5 w-3.5 fill-suya-sun text-suya-sun" />
              {store.rating.toFixed(1)}
            </span>
          )}
        </div>

        {availability ? (
          <p className="mt-2 text-xs font-semibold text-suya-muted">{availability}</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-suya-muted">
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {formatEta(store.etaMin, store.etaMax)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Bike aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {store.deliveryFee === 0 ? 'Envío gratis' : `Envío ${formatPrice(store.deliveryFee)}`}
            </span>
            {store.distanceKm > 0 && (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                {formatDistance(store.distanceKm)}
              </span>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => toggleFavorite(store.id)}
        aria-label={isFavorite ? `Quitar ${store.name} de favoritos` : `Guardar ${store.name} en favoritos`}
        aria-pressed={isFavorite}
        className={cn(
          'press absolute z-10 grid h-11 w-11 place-items-center rounded-full text-suya-carbon hover:text-suya-green',
          stacked ? 'right-2 top-2 bg-white shadow-sm' : 'right-0 top-0',
        )}
      >
        <Heart
          aria-hidden="true"
          className={cn('suya-favorite-icon h-[18px] w-[18px]', isFavorite && 'fill-suya-danger text-suya-danger')}
        />
      </button>
    </article>
  );
}
