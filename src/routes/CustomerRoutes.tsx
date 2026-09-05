import { Suspense, lazy, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CustomerLayout } from '@/layouts/CustomerLayout';
import { RouteFallback } from './RouteFallback';
import { RequireAccess } from './RequireAccess';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';

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
const TableQrPage = lazy(() => import('@/pages/customer/TableQrPage'));
const MenuPage = lazy(() => import('@/pages/customer/MenuPage'));
const GuestOrderPage = lazy(() => import('@/pages/customer/GuestOrderPage'));
const NotFoundPage = lazy(() => import('@/pages/shared/NotFoundPage'));
const LoginPage = lazy(() => import('@/pages/shared/LoginPage'));
const UnauthorizedPage = lazy(() => import('@/pages/shared/UnauthorizedPage'));

interface TableContext {
  tableId?: string;
  tableNumber?: string;
  sessionId?: string | null;
}

function tableContextFromSession(): TableContext | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem('suya.tableContext') ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    return typeof row.tableId === 'string'
      ? {
        tableId: row.tableId,
        tableNumber: typeof row.tableNumber === 'string' ? row.tableNumber : undefined,
        sessionId: typeof row.sessionId === 'string' ? row.sessionId : null,
      }
      : null;
  } catch {
    return null;
  }
}

/**
 * Delivery checkout remains account-protected. Digital menu and table QR checkout
 * intentionally skip that guard: the restaurant owns the order context, not Suya
 * customer membership. Suya Account stays an optional benefit inside checkout.
 */
function CheckoutAccessRoute() {
  const location = useLocation();
  const origin = useCartStore((state) => state.origin);
  const [tableContext] = useState(tableContextFromSession);
  const status = useAuthStore((state) => state.status);
  const identity = useAuthStore((state) => state.identity);
  const publicMenuOrder = origin === 'suya_menu' || Boolean(tableContext?.tableId);

  if (publicMenuOrder) return <CheckoutPage />;
  if (status === 'idle' || status === 'loading') return <RouteFallback />;
  if (!identity) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!identity.access.includes('customer')) return <Navigate to="/unauthorized" replace />;
  return <CheckoutPage />;
}

export function CustomerRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="table/:token" element={<TableQrPage />} />
        <Route path="menu/:slug" element={<MenuPage />} />
        <Route path="menu/:slug/pedido/:id" element={<GuestOrderPage />} />
        <Route path="pedido/:id" element={<GuestOrderPage />} />
        <Route element={<CustomerLayout />}>
          <Route index element={<HomePage />} />
          <Route path="stores" element={<StoresPage />} />
          <Route path="store/:id" element={<StoreDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="checkout" element={<CheckoutAccessRoute />} />
          <Route element={<RequireAccess anyOf={['customer']} />}>
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
