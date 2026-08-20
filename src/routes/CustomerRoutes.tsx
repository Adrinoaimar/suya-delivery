import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CustomerLayout } from '@/layouts/CustomerLayout';
import { RouteFallback } from './RouteFallback';
import { RequireAccess } from './RequireAccess';

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
const NotFoundPage = lazy(() => import('@/pages/shared/NotFoundPage'));
const LoginPage = lazy(() => import('@/pages/shared/LoginPage'));
const UnauthorizedPage = lazy(() => import('@/pages/shared/UnauthorizedPage'));

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
          <Route path="help" element={<HelpPage />} />
          <Route element={<RequireAccess anyOf={['customer']} />}>
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="orders/:id/track" element={<OrderTrackPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="login" element={<LoginPage title="Ingresa a Suya" allowed={['customer']} allowCustomerSignup defaultPath="/profile" />} />
        <Route path="unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
