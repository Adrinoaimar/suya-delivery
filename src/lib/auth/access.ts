import type { AccessRole } from './types';

interface AccessSources {
  riderStatus?: string | null;
  riderVerifiedAt?: string | null;
  restaurantIds: string[];
  platformRole?: unknown;
}

export function resolveAccess(sources: AccessSources): AccessRole[] {
  const access: AccessRole[] = ['customer'];
  if (sources.riderVerifiedAt && sources.riderStatus !== 'suspended') access.push('rider');
  if (sources.restaurantIds.length > 0) access.push('restaurant_staff');
  if (sources.platformRole === 'platform_admin') access.push('platform_admin');
  return access;
}
