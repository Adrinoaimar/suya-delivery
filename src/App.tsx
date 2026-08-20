import { AppShell } from '@/app/AppShell';
import { OrderBootstrap } from '@/app/OrderBootstrap';
import { AppRoutes } from '@/routes/AppRoutes';

export default function App() {
  return (
    <AppShell>
      <OrderBootstrap />
      <AppRoutes />
    </AppShell>
  );
}
