import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RiderLayout } from '@/layouts/RiderLayout';
import { RouteFallback } from './RouteFallback';
import { RequireAccess } from './RequireAccess';

const RiderHomePage = lazy(() => import('@/pages/rider/RiderHomePage'));
const RiderCurrentPage = lazy(() => import('@/pages/rider/RiderCurrentPage'));
const RiderSafetyPage = lazy(() => import('@/pages/rider/RiderSafetyPage'));
const RiderHistoryPage = lazy(() => import('@/pages/rider/RiderHistoryPage'));
const RiderEarningsPage = lazy(() => import('@/pages/rider/RiderEarningsPage'));
const RiderSettingsPage = lazy(() => import('@/pages/rider/RiderSettingsPage'));
const RiderHelpPage = lazy(() => import('@/pages/rider/RiderHelpPage'));
const NotFoundPage = lazy(() => import('@/pages/shared/NotFoundPage'));
const LoginPage = lazy(() => import('@/pages/shared/LoginPage'));
const UnauthorizedPage = lazy(() => import('@/pages/shared/UnauthorizedPage'));

export function RiderRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="login" element={<LoginPage title="Acceso de repartidor" allowed={['rider']} defaultPath="/rider" />} />
        <Route path="unauthorized" element={<UnauthorizedPage />} />
        <Route element={<RequireAccess anyOf={['rider']} />}>
          <Route index element={<Navigate to="/rider" replace />} />
          <Route path="/rider" element={<RiderLayout />}>
            <Route index element={<RiderHomePage />} />
            <Route path="current" element={<RiderCurrentPage />} />
            <Route path="safety" element={<RiderSafetyPage />} />
            <Route path="history" element={<RiderHistoryPage />} />
            <Route path="earnings" element={<RiderEarningsPage />} />
            <Route path="settings" element={<RiderSettingsPage />} />
            <Route path="help" element={<RiderHelpPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
