import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { RouteFallback } from './RouteFallback';
import type { AccessRole } from '@/lib/auth/types';
import { useAuthStore } from '@/store/authStore';

export function RequireAccess({ anyOf }: { anyOf: AccessRole[] }) {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const identity = useAuthStore((state) => state.identity);

  if (status === 'idle' || status === 'loading') return <RouteFallback />;
  if (!identity) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!anyOf.some((role) => identity.access.includes(role))) {
    return <Navigate to="/unauthorized" replace />;
  }
  return <Outlet />;
}
