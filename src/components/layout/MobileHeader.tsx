import { useState } from 'react';
import { Bell, ChevronDown, MapPin, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CounterBadge } from '@/components/common/Badge';
import { LogoMark } from '@/components/common/Logo';
import { useCartStore } from '@/store/cartStore';
import { useUserStore } from '@/store/userStore';
import { LocationPicker } from './LocationPicker';
import { NotificationsSheet } from './NotificationsSheet';

export function MobileHeader() {
  const [locationOpen, setLocationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const locationLabel = useUserStore((state) => state.preferences.locationLabel);
  const count = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));

  return (
    <>
      <header className="suya-lens-nav sticky top-0 z-30 border-x-0 border-t-0 text-suya-carbon lg:hidden">
        <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-[calc(8px+env(safe-area-inset-top))]">
          <Link
            to="/"
            aria-label="Suya Delivery — Inicio"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          >
            <LogoMark className="h-9 w-9" />
          </Link>

          <button
            type="button"
            onClick={() => setLocationOpen(true)}
            className="press min-h-12 min-w-0 flex-1 rounded-[18px] px-3 text-left transition-colors hover:bg-white/60"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-suya-carbon/75">
              Entregar en
            </span>
            <span className="flex w-full items-center gap-1 text-sm font-semibold">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{locationLabel}</span>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setNotificationsOpen(true)}
            aria-label="Notificaciones"
            className="press suya-lens-quiet flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl hover:bg-white/80"
          >
            <Bell className="h-5 w-5" />
          </button>

          <Link
            to="/cart"
            aria-label={`Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`}
            className="press suya-lens-quiet relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl hover:bg-white/80"
          >
            <ShoppingBag className="h-5 w-5" />
            <CounterBadge count={count} pulse />
          </Link>
        </div>
      </header>

      <LocationPicker open={locationOpen} onClose={() => setLocationOpen(false)} />
      <NotificationsSheet open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}
