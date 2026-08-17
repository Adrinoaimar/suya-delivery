import { useState } from 'react';
import { Bell, ChevronDown, MapPin, ShoppingBag, User } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { CounterBadge } from '@/components/common/Badge';
import { Logo } from '@/components/common/Logo';
import { SearchInput } from '@/components/common/SearchInput';
import { cn } from '@/lib/cn';
import { useCartStore } from '@/store/cartStore';
import { useUserStore } from '@/store/userStore';
import { LocationPicker } from './LocationPicker';
import { NotificationsSheet } from './NotificationsSheet';

const LINKS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/stores', label: 'Tiendas', end: false },
  { to: '/promotions', label: 'Promociones', end: false },
  { to: '/help', label: 'Ayuda', end: false },
];

export function DesktopHeader() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const locationLabel = useUserStore((state) => state.preferences.locationLabel);
  const pushSearch = useUserStore((state) => state.pushSearch);
  const count = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0),
  );

  function submitSearch() {
    if (query.trim().length === 0) {
      navigate('/search');
      return;
    }
    pushSearch(query);
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <>
      <header className="sticky top-0 z-30 hidden border-b border-suya-mist bg-white lg:block">
        <div className="shell flex h-[72px] items-center gap-5">
          <Link to="/" aria-label="Suya Delivery — Inicio">
            <Logo size="sm" />
          </Link>

          <button
            type="button"
            onClick={() => setLocationOpen(true)}
            className="press flex shrink-0 items-center gap-1.5 rounded-btn border border-suya-mist px-3 py-2 text-sm font-medium hover:border-suya-lime"
          >
            <MapPin aria-hidden="true" className="h-4 w-4 text-suya-green" />
            <span className="max-w-[190px] truncate">{locationLabel}</span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-[#6B7076]" />
          </button>

          <nav aria-label="Principal" className="flex items-center gap-1">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-btn px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-suya-lime-soft text-suya-green-dark'
                      : 'text-suya-carbon hover:bg-suya-mist/60',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto w-full max-w-xs">
            <SearchInput value={query} onChange={setQuery} onSubmit={submitSearch} />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Notificaciones"
              className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-suya-mist/70"
            >
              <Bell className="h-5 w-5" />
            </button>
            <Link
              to="/cart"
              aria-label={`Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`}
              className="press relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-suya-mist/70"
            >
              <ShoppingBag className="h-5 w-5" />
              <CounterBadge count={count} />
            </Link>
            <Link
              to="/profile"
              aria-label="Mi cuenta"
              className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-suya-mist/70"
            >
              <User className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <LocationPicker open={locationOpen} onClose={() => setLocationOpen(false)} />
      <NotificationsSheet open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}
