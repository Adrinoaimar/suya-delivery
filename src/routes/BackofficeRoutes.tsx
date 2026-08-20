import { Navigate, Route, Routes } from 'react-router-dom';
import { BackofficeLayout } from '@/layouts/BackofficeLayout';
import { BackofficePage } from '@/pages/backoffice/BackofficePage';
import { RequireAccess } from './RequireAccess';
import LoginPage from '@/pages/shared/LoginPage';
import UnauthorizedPage from '@/pages/shared/UnauthorizedPage';

export function BackofficeRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage title="Acceso de operaciones" allowed={['platform_admin']} defaultPath="/" />} />
      <Route path="unauthorized" element={<UnauthorizedPage />} />
      <Route element={<RequireAccess anyOf={['platform_admin']} />}>
        <Route element={<BackofficeLayout />}>
          <Route index element={<BackofficePage title="Resumen" description="Estado general de la operación Suya." />} />
          <Route path="orders" element={<BackofficePage title="Pedidos" description="Cola operativa y estados de preparación y entrega." />} />
          <Route path="catalog" element={<BackofficePage title="Catálogo" description="Productos, precios, disponibilidad y temas por restaurante." />} />
          <Route path="riders" element={<BackofficePage title="Repartidores" description="Disponibilidad, asignaciones e incidencias." />} />
          <Route path="restaurants" element={<BackofficePage title="Restaurantes" description="Altas, membresías y verificación comercial." />} />
          <Route path="settings" element={<BackofficePage title="Configuración" description="Parámetros de operación y seguridad." />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
