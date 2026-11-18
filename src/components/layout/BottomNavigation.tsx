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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-suya-border bg-white px-2 pb-safe-bottom lg:hidden"
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
                    'relative flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-btn text-[11px] font-semibold transition-colors hover:bg-suya-ivory',
                    isActive ? 'text-suya-green' : 'text-suya-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'relative rounded-full px-3 py-1 transition-colors',
                        isActive && 'bg-suya-lime-soft text-suya-green-dark',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn('h-[22px] w-[22px]', isActive && 'suya-value-in stroke-[2.4]')}
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
