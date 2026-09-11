import { Home, Receipt, Search, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useOrderStore, selectActiveOrder } from '@/store/orderStore';

const ITEMS = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/search', label: 'Buscar', icon: Search, end: false },
  { to: '/orders', label: 'Pedidos', icon: Receipt, end: false },
  { to: '/profile', label: 'Cuenta', icon: User, end: false },
];

/** Navegación inferior fija en móvil. Máximo cuatro destinos. */
export function BottomNavigation() {
  const hasActiveOrder = useOrderStore((state) => Boolean(selectActiveOrder(state.orders)));

  return (
    <nav
      aria-label="Navegación principal"
      className="suya-lens-nav fixed inset-x-4 bottom-[calc(var(--bottom-nav-gap)+env(safe-area-inset-bottom,0px))] z-30 rounded-promo p-1.5 lg:hidden"
    >
      <ul className="mx-auto flex max-w-md gap-0.5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-[60px] min-h-12 flex-col items-center justify-center gap-1 rounded-[19px] text-[11px] font-semibold transition-[color,background-color,transform] active:scale-[0.97]',
                    isActive ? 'text-suya-green' : 'text-suya-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'relative rounded-xl px-3 py-1 transition-[background-color,color,box-shadow]',
                        isActive && 'bg-suya-green text-white shadow-[0_8px_20px_rgba(11,112,72,.24)]',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn('h-[22px] w-[22px]', isActive && 'stroke-[2.4]')}
                      />
                      {item.to === '/orders' && hasActiveOrder && (
                        <>
                          <span
                            aria-hidden="true"
                            className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-suya-sun ring-2 ring-white"
                          />
                          <span className="sr-only">Pedido activo</span>
                        </>
                      )}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
