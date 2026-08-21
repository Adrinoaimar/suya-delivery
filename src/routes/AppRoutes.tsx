import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { StoreListSkeleton } from '@/components/common/Skeleton';
import { CustomerLayout } from '@/layouts/CustomerLayout';
import { RiderLayout } from '@/layouts/RiderLayout';

const HomePage = lazy(() => import('@/pages/customer/HomePage'));
const StoresPage = lazy(() => import('@/pages/customer/StoresPage'));
const StoreDetailPage = lazy(() => import('@/pages/customer/StoreDetailPage'));
const SearchPage = lazy(() => import('@/pages/customer/SearchPage'));
const CartPage = lazy(() => import('@/pages/customer/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/customer/CheckoutPage'));
const OrdersPage = lazy(() => import('@/pages/customer/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/customer/OrderDetailPage'));
const OrderTrackPage = lazy(() => import('@/pages/customer/OrderTrackPage'));
const ProfilePage = lazy(() => import('@/pages/customer/ProfilePage'));
const HelpPage = lazy(() => import('@/pages/customer/HelpPage'));

const RiderHomePage = lazy(() => import('@/pages/rider/RiderHomePage'));
const RiderCurrentPage = lazy(() => import('@/pages/rider/RiderCurrentPage'));
const RiderSafetyPage = lazy(() => import('@/pages/rider/RiderSafetyPage'));
const RiderHistoryPage = lazy(() => import('@/pages/rider/RiderHistoryPage'));
const RiderSettingsPage = lazy(() => import('@/pages/rider/RiderSettingsPage'));

const NotFoundPage = lazy(() => import('@/pages/shared/NotFoundPage'));

function RouteFallback() {
  return (
    <div className="shell py-6">
      <StoreListSkeleton count={6} />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<CustomerLayout />}>
          <Route index element={<HomePage />} />
          <Route path="stores" element={<StoresPage />} />
          <Route path="store/:id" element={<StoreDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="orders/:id/track" element={<OrderTrackPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="help" element={<HelpPage />} />
          {/* Ficha pública del repartidor: las rutas estáticas de /rider tienen prioridad */}
        </Route>

        <Route path="/rider" element={<RiderLayout />}>
          <Route index element={<RiderHomePage />} />
          <Route path="current" element={<RiderCurrentPage />} />
          <Route path="safety" element={<RiderSafetyPage />} />
          <Route path="history" element={<RiderHistoryPage />} />
          <Route path="settings" element={<RiderSettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
