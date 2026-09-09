import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAccess } from './RequireAccess';
import { RouteFallback } from './RouteFallback';
import { CustomerRoutes } from './CustomerRoutes';
import { RiderLayout } from '@/layouts/RiderLayout';
import { BackofficeLayout } from '@/layouts/BackofficeLayout';

const RiderHomePage = lazy(() => import('@/pages/rider/RiderHomePage'));
const RiderCurrentPage = lazy(() => import('@/pages/rider/RiderCurrentPage'));
const RiderSafetyPage = lazy(() => import('@/pages/rider/RiderSafetyPage'));
const RiderHistoryPage = lazy(() => import('@/pages/rider/RiderHistoryPage'));
const RiderSettingsPage = lazy(() => import('@/pages/rider/RiderSettingsPage'));
const RiderHelpPage = lazy(() => import('@/pages/rider/RiderHelpPage'));
const BackofficeLoginPage = lazy(() => import('@/pages/shared/LoginPage'));
const UnauthorizedPage = lazy(() => import('@/pages/shared/UnauthorizedPage'));
const OperationsSummaryPage = lazy(() => import('@/pages/backoffice/OperationsSummaryPage'));
const OrdersOperationsPage = lazy(() => import('@/pages/backoffice/OrdersOperationsPage'));
const TablesOperationsPage = lazy(() => import('@/pages/backoffice/TablesOperationsPage'));
const CatalogPage = lazy(() => import('@/pages/backoffice/CatalogPage'));
const OffersPage = lazy(() => import('@/pages/backoffice/OffersPage'));
const WalletsOperationsPage = lazy(() => import('@/pages/backoffice/WalletsOperationsPage'));
const BackofficePage = lazy(() => import('@/pages/backoffice/BackofficePage').then((module) => ({ default: module.BackofficePage })));

function MobileRiderRoutes() {
  return (
    <Routes>
      <Route path="login" element={<BackofficeLoginPage title="Acceso de repartidor" allowed={['rider']} defaultPath="/rider" />} />
      <Route path="unauthorized" element={<UnauthorizedPage />} />
      <Route element={<RequireAccess anyOf={['rider']} loginPath="/rider/login" unauthorizedPath="/rider/unauthorized" />}>
        <Route index element={<Navigate to="/rider" replace />} />
        <Route element={<RiderLayout />}>
          <Route index element={<RiderHomePage />} />
          <Route path="current" element={<RiderCurrentPage />} />
          <Route path="safety" element={<RiderSafetyPage />} />
          <Route path="history" element={<RiderHistoryPage />} />
          <Route path="settings" element={<RiderSettingsPage />} />
          <Route path="help" element={<RiderHelpPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/rider" replace />} />
    </Routes>
  );
}

function MobileBackofficeRoutes() {
  return (
    <Routes>
      <Route path="login" element={<BackofficeLoginPage title="Acceso de operaciones" allowed={['platform_admin', 'restaurant_staff']} defaultPath="/backoffice" />} />
      <Route path="unauthorized" element={<UnauthorizedPage />} />
      <Route element={<RequireAccess anyOf={['platform_admin', 'restaurant_staff']} loginPath="/backoffice/login" unauthorizedPath="/backoffice/unauthorized" />}>
        <Route element={<BackofficeLayout basePath="/backoffice" />}>
          <Route index element={<OperationsSummaryPage />} />
          <Route path="orders" element={<OrdersOperationsPage />} />
          <Route path="tables" element={<TablesOperationsPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="offers" element={<OffersPage />} />
          <Route path="wallets" element={<WalletsOperationsPage />} />
          <Route path="riders" element={<BackofficePage title="Repartidores" description="Disponibilidad, asignaciones e incidencias." />} />
          <Route path="restaurants" element={<BackofficePage title="Restaurantes" description="Altas, membresías y verificación comercial." />} />
          <Route path="settings" element={<BackofficePage title="Configuración" description="Parámetros de operación y seguridad." />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/backoffice" replace />} />
    </Routes>
  );
}

/** APK único: cliente en raíz, repartidor en /rider y operaciones en /backoffice. */
export function MobileRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/rider/*" element={<MobileRiderRoutes />} />
        <Route path="/backoffice/*" element={<MobileBackofficeRoutes />} />
        <Route path="*" element={<CustomerRoutes />} />
      </Routes>
    </Suspense>
  );
}
