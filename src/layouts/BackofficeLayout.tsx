import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings,
  Store,
  Table2,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogoMark } from '@/components/common/Logo';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';

interface BackofficeLayoutProps {
  basePath?: string;
}

export function BackofficeLayout({ basePath = '' }: BackofficeLayoutProps) {
  const identity = useAuthStore((state) => state.identity);
  const signOut = useAuthStore((state) => state.signOut);
  const location = useLocation();
  const navigationRef = useRef<HTMLElement | null>(null);
  const prefix = basePath.replace(/\/$/, '');
  const navigation = [
    { to: `${prefix}/`, label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: `${prefix}/orders`, label: 'Pedidos', icon: ClipboardList },
    { to: `${prefix}/tables`, label: 'Mesas y QR', icon: Table2 },
    { to: `${prefix}/catalog`, label: 'Catálogo', icon: Store },
    { to: `${prefix}/offers`, label: 'Ofertas', icon: Tag },
    { to: `${prefix}/wallets`, label: 'Dispositivos de pagos', icon: Wallet },
    { to: `${prefix}/riders`, label: 'Repartidores', icon: Users },
    { to: `${prefix}/restaurants`, label: 'Restaurantes', icon: Building2 },
    { to: `${prefix}/settings`, label: 'Configuración', icon: Settings },
  ];

  // En móvil la navegación es horizontal; deja siempre la sección activa completa y visible
  // después de cambiar de pantalla, evitando que el texto quede cortado entre dos pestañas.
  useEffect(() => {
    const activeLink = navigationRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    activeLink?.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-transparent text-suya-carbon lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="suya-lens-dark border-b border-white/10 p-4 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2">
          <LogoMark tone="onDark" className="h-9 w-9" />
          <div>
            <p className="font-display font-bold">Suya Operaciones</p>
            <p className="text-xs text-white/65">Backoffice</p>
          </div>
        </div>
        <nav
          ref={navigationRef}
          className="hide-scrollbar -mx-1 mt-4 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:mt-5 lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:px-0"
          aria-label="Operaciones"
        >
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 shrink-0 items-center gap-2 rounded-btn px-3 text-sm font-medium',
                  isActive ? 'bg-suya-lime text-suya-carbon' : 'text-white/75 hover:bg-white/10',
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="suya-lens-nav sticky top-0 z-20 flex items-center justify-between gap-2 px-4 py-3 lg:px-7">
          <div className="min-w-0">
            <p className="font-display font-bold">Centro de operaciones</p>
            <p className="truncate text-xs text-suya-muted">{identity?.email}</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-btn px-3 text-sm font-semibold text-suya-muted hover:bg-white/70"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-[1280px] p-4 lg:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
