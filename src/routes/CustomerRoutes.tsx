import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CustomerLayout } from '@/layouts/CustomerLayout';
import { RouteFallback } from './RouteFallback';

const HomePage = lazy(() => import('@/pages/customer/HomePage'));
const StoresPage = lazy(() => import('@/pages/customer/StoresPage'));
const StoreDetailPage = lazy(() => import('@/pages/customer/StoreDetailPage'));
const SearchPage = lazy(() => import('@/pages/customer/SearchPage'));
const CartPage = lazy(() => import('@/pages/customer/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/customer/CheckoutPage'));
const OrdersPage = lazy(() => import('@/pages/customer/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/customer/OrderDetailPage'));
const OrderTrackPage = lazy(() => import('@/pages/customer/OrderTrackPage'));
const PromotionsPage = lazy(() => import('@/pages/customer/PromotionsPage'));
const ProfilePage = lazy(() => import('@/pages/customer/ProfilePage'));
const HelpPage = lazy(() => import('@/pages/customer/HelpPage'));
const RiderProfilePage = lazy(() => import('@/pages/customer/RiderProfilePage'));
const SharePage = lazy(() => import('@/pages/shared/SharePage'));
const NotFoundPage = lazy(() => import('@/pages/shared/NotFoundPage'));

export function CustomerRoutes() {
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
          <Route path="promotions" element={<PromotionsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="rider/:id" element={<RiderProfilePage />} />
        </Route>
        <Route path="share/:token" element={<SharePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
