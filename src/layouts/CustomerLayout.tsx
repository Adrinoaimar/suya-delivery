import { Outlet, useLocation } from 'react-router-dom';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { DesktopHeader } from '@/components/layout/DesktopHeader';
import { Footer } from '@/components/layout/Footer';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { SeoHead } from '@/components/common/SeoHead';

function isPrivateCustomerPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/checkout' ||
    pathname === '/cart' ||
    pathname === '/search' ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/pedido/') ||
    pathname.startsWith('/table/') ||
    /^\/menu\/[^/]+\/pedido\//.test(pathname)
  );
}

export function CustomerLayout() {
  const location = useLocation();
  const privatePath = isPrivateCustomerPath(location.pathname);

  return (
    <div className="flex min-h-dvh flex-col bg-transparent">
      {privatePath && (
        <SeoHead
          title="Suya Delivery"
          description="Área operativa de Suya Delivery."
          path={location.pathname}
          noIndex
        />
      )}
      <MobileHeader />
      <DesktopHeader />
      <main id="contenido" className="pb-nav flex-1 lg:pb-0">
        <Outlet />
      </main>
      <Footer />
      <BottomNavigation />
    </div>
  );
}
