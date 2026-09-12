import { Navigate, Route, Routes } from 'react-router-dom';
import { BackofficeLayout } from '@/layouts/BackofficeLayout';
import { BackofficePage } from '@/pages/backoffice/BackofficePage';
import { RequireAccess } from './RequireAccess';
import LoginPage from '@/pages/shared/LoginPage';
import UnauthorizedPage from '@/pages/shared/UnauthorizedPage';
import OrdersOperationsPage from '@/pages/backoffice/OrdersOperationsPage';
import OperationsSummaryPage from '@/pages/backoffice/OperationsSummaryPage';
import TablesOperationsPage from '@/pages/backoffice/TablesOperationsPage';
import CatalogPage from '@/pages/backoffice/CatalogPage';
import OffersPage from '@/pages/backoffice/OffersPage';
import WalletsOperationsPage from '@/pages/backoffice/WalletsOperationsPage';

export function BackofficeRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage title="Acceso de operaciones" allowed={['platform_admin', 'restaurant_staff']} defaultPath="/" />} />
      <Route path="unauthorized" element={<UnauthorizedPage />} />
      <Route element={<RequireAccess anyOf={['platform_admin', 'restaurant_staff']} />}>
        <Route element={<BackofficeLayout />}>
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
