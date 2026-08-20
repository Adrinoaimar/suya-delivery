import { Building2, ClipboardList, LayoutDashboard, LogOut, Settings, Store, Users } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogoMark } from '@/components/common/Logo';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';

const navigation = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/orders', label: 'Pedidos', icon: ClipboardList },
  { to: '/catalog', label: 'Catálogo', icon: Store },
  { to: '/riders', label: 'Repartidores', icon: Users },
  { to: '/restaurants', label: 'Restaurantes', icon: Building2 },
  { to: '/settings', label: 'Configuración', icon: Settings },
];

export function BackofficeLayout() {
  const identity = useAuthStore((state) => state.identity);
  const signOut = useAuthStore((state) => state.signOut);
  return (
    <div className="min-h-dvh bg-[#F4F6F8] text-[#20242A] lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-b border-white/10 bg-[#15231D] p-4 text-white lg:min-h-dvh lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2">
          <LogoMark tone="onDark" className="h-9 w-9" />
          <div>
            <p className="font-display font-bold">Suya Operaciones</p>
            <p className="text-xs text-white/65">Backoffice</p>
          </div>
        </div>
        <nav className="mt-5 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1" aria-label="Operaciones">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-btn px-3 py-2.5 text-sm font-medium',
                  isActive ? 'bg-suya-lime text-[#15231D]' : 'text-white/75 hover:bg-white/10',
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
        <header className="flex items-center justify-between border-b border-[#E0E5E2] bg-white px-4 py-3 lg:px-7">
          <div>
            <p className="font-display font-bold">Centro de operaciones</p>
            <p className="text-xs text-[#68716C]">{identity?.email}</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#68716C]"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </header>
        <main id="contenido" className="p-4 lg:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
