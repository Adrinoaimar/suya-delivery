import { useState } from 'react';
import {
  CircleHelp,
  History,
  LayoutDashboard,
  Menu,
  Navigation,
  Settings,
  ShieldCheck,
  Store,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Drawer } from '@/components/common/Drawer';
import { LogoMark } from '@/components/common/Logo';
import { cn } from '@/lib/cn';
import { useRiderStore } from '@/store/riderStore';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const PRIMARY: NavItem[] = [
  { to: '/rider', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/rider/current', label: 'Viaje', icon: Navigation },
  { to: '/rider/safety', label: 'Seguridad', icon: ShieldCheck },
];

const SECONDARY: NavItem[] = [
  { to: '/rider/history', label: 'Historial', icon: History },
  { to: '/rider/earnings', label: 'Ganancias', icon: Wallet },
  { to: '/rider/settings', label: 'Configuración', icon: Settings },
  { to: '/help', label: 'Ayuda', icon: CircleHelp },
];

function linkClasses(isActive: boolean): string {
  return cn(
    'flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm font-medium transition-colors',
    isActive ? 'bg-suya-green text-white' : 'text-white/75 hover:bg-white/10',
  );
}

/** Área del repartidor: superficie oscura, claramente distinta de la del cliente. */
export function RiderLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const available = useRiderStore((state) => state.available);

  return (
    <div className="flex min-h-dvh flex-col bg-[#14161A] text-white lg:flex-row">
      {/* Barra lateral en escritorio */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#1A1D22] p-4 lg:flex">
        <Link to="/rider" className="mb-6 flex items-center gap-2">
          <LogoMark tone="onDark" className="h-9 w-9" />
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-bold">Suya</span>
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-white/70">
              Repartidor
            </span>
          </span>
        </Link>

        <nav aria-label="Panel del repartidor" className="flex flex-1 flex-col gap-1">
          {[...PRIMARY, ...SECONDARY].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => linkClasses(isActive)}
            >
              <item.icon aria-hidden="true" className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/"
          className="mt-4 flex items-center gap-2 rounded-btn border border-white/15 px-3 py-2.5 text-sm text-white/80 hover:bg-white/10"
        >
          <Store aria-hidden="true" className="h-[18px] w-[18px]" />
          Volver a la tienda
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera móvil */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/10 bg-[#1A1D22] px-3 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))] lg:hidden">
          <Link to="/rider" aria-label="Panel del repartidor" className="shrink-0">
            <LogoMark tone="onDark" className="h-9 w-9" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold leading-tight">Panel repartidor</p>
            <p className="flex items-center gap-1.5 text-xs text-white/70">
              <span
                aria-hidden="true"
                className={cn(
                  'h-2 w-2 rounded-full',
                  available ? 'bg-suya-lime' : 'bg-white/40',
                )}
              />
              {available ? 'Disponible' : 'No disponible'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú del repartidor"
            className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0">
          <Outlet />
        </main>

        {/* Navegación inferior móvil */}
        <nav
          aria-label="Navegación del repartidor"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#1A1D22] lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <ul className="mx-auto flex max-w-md">
            {PRIMARY.map((item) => (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex h-[68px] flex-col items-center justify-center gap-1 text-[11px] font-medium',
                      isActive ? 'text-suya-lime' : 'text-white/65',
                    )
                  }
                >
                  <item.icon aria-hidden="true" className="h-[22px] w-[22px]" />
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="flex h-[68px] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-white/65"
              >
                <Menu aria-hidden="true" className="h-[22px] w-[22px]" />
                Más
              </button>
            </li>
          </ul>
        </nav>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menú del repartidor" side="right">
        <nav aria-label="Más opciones del repartidor" className="flex flex-col gap-1">
          {[...PRIMARY, ...SECONDARY].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-btn px-3 py-3 text-[15px] font-medium transition-colors',
                  isActive
                    ? 'bg-suya-lime-soft text-suya-green-dark'
                    : 'text-suya-carbon hover:bg-suya-mist/60',
                )
              }
            >
              <item.icon aria-hidden="true" className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="mt-2 flex items-center gap-3 rounded-btn border border-suya-mist px-3 py-3 text-[15px] font-medium text-suya-carbon"
          >
            <Store aria-hidden="true" className="h-5 w-5" />
            Volver a la tienda
          </Link>
        </nav>
      </Drawer>
    </div>
  );
}
