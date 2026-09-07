import { Bike, Clock, Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/common/Badge';
import { Rating } from '@/components/common/Rating';
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

export function StoreCard({ store, layout = 'grid', className }: StoreCardProps) {
  const favorites = useUserStore((state) => state.favorites);
  const toggleFavorite = useUserStore((state) => state.toggleFavorite);
  const isFavorite = favorites.includes(store.id);
  const informationalOnly = isInformationalStore(store);
  const open = isStoreAcceptingOrders(store);

  const meta = informationalOnly ? (
    <span className="inline-flex items-center gap-1 font-medium">
      <Clock aria-hidden="true" className="h-3.5 w-3.5" />
      Datos operativos por confirmar
    </span>
  ) : (
    <>
      <span className="inline-flex items-center gap-1">
        <Clock aria-hidden="true" className="h-3.5 w-3.5" />
        {formatEta(store.etaMin, store.etaMax)}
      </span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1">
        <Bike aria-hidden="true" className="h-3.5 w-3.5" />
        {store.deliveryFee === 0 ? 'Envío gratis' : formatPrice(store.deliveryFee)}
      </span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1">
        <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
        {formatDistance(store.distanceKm)}
      </span>
    </>
  );

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-card border border-suya-border bg-white/90 shadow-card transition-[transform,box-shadow] duration-300 ease-out active:scale-[0.985] motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-soft',
        layout === 'row' && 'flex',
        className,
      )}
    >
      <div
        className={cn(
          'relative shrink-0 overflow-hidden bg-suya-ivory',
          layout === 'grid' ? 'h-40 w-full' : 'min-h-32 w-32',
        )}
      >
        <Thumb
          name={store.name}
          src={store.image}
          variant="store"
          rounded="rounded-none"
          textClassName={layout === 'grid' ? 'text-3xl' : 'text-2xl'}
        />
        {!open && (
          <div className="absolute inset-0 flex items-center justify-center bg-suya-carbon/55">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-suya-carbon">
              {informationalOnly ? 'Carta informativa' : 'Cerrado ahora'}
            </span>
          </div>
        )}
        {store.promoLabel && open && (
          <span className="absolute left-2 top-2">
            <Badge tone="sun">{store.promoLabel}</Badge>
          </span>
        )}
        {store.isBeta && (
          <span className="absolute right-2 top-2">
            <Badge tone="green">Beta</Badge>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-[15px] font-bold leading-snug">
            <Link to={`/store/${store.id}`} className="after:absolute after:inset-0">
              {store.name}
            </Link>
          </h3>
          <button
            type="button"
            onClick={() => toggleFavorite(store.id)}
            aria-label={
              isFavorite
                ? `Quitar ${store.name} de favoritos`
                : `Guardar ${store.name} en favoritos`
            }
            aria-pressed={isFavorite}
            className="relative z-10 -mr-2 -mt-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-suya-muted transition-colors hover:bg-suya-mist/70"
          >
            <Heart
              className={cn('h-[18px] w-[18px]', isFavorite && 'fill-suya-danger text-suya-danger')}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-suya-muted">
          <Rating value={store.rating} reviews={store.reviews} className="text-xs" />
          <span aria-hidden="true">·</span>
          <span>{store.tags[0]}</span>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-suya-muted">
          {meta}
        </div>

        {store.isLocal && (
          <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-suya-lime-soft px-2 py-0.5 text-[11px] font-semibold text-suya-green-dark">
            Negocio de Sullana
          </span>
        )}
      </div>
    </article>
  );
}
