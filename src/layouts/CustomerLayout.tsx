import { Outlet } from 'react-router-dom';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { DesktopHeader } from '@/components/layout/DesktopHeader';
import { Footer } from '@/components/layout/Footer';
import { MobileHeader } from '@/components/layout/MobileHeader';

export function CustomerLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-transparent">
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
