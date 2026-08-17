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
  const count = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0),
  );

  return (
    <>
      <header className="sticky top-0 z-30 bg-suya-green text-white lg:hidden">
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))]">
          <Link to="/" aria-label="Suya Delivery — Inicio" className="shrink-0">
            <LogoMark tone="onDark" className="h-9 w-9" />
          </Link>

          <button
            type="button"
            onClick={() => setLocationOpen(true)}
            className="press flex min-w-0 flex-1 flex-col items-start rounded-btn px-1.5 py-1 text-left hover:bg-white/10"
          >
            <span className="text-[11px] uppercase tracking-wider text-white/75">Entregar en</span>
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
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
          >
            <Bell className="h-5 w-5" />
          </button>

          <Link
            to="/cart"
            aria-label={`Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`}
            className="press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
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
