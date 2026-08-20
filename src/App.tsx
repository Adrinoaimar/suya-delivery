import { AppShell } from '@/app/AppShell';
import { OrderBootstrap } from '@/app/OrderBootstrap';
import { AuthBootstrap } from '@/app/AuthBootstrap';
import { AppRoutes } from '@/routes/AppRoutes';

export default function App() {
  return (
    <AppShell>
      <AuthBootstrap />
      <OrderBootstrap />
      <AppRoutes />
    </AppShell>
  );
}
