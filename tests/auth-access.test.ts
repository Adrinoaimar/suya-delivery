import { describe, expect, it } from 'vitest';
import { resolveAccess } from '@/lib/auth/access';

describe('resolveAccess', () => {
  it('mantiene cliente como capacidad base', () => {
    expect(resolveAccess({ restaurantIds: [] })).toEqual(['customer']);
  });

  it('solo habilita rider verificado y no suspendido', () => {
    expect(
      resolveAccess({ riderVerifiedAt: '2026-08-20T00:00:00Z', riderStatus: 'available', restaurantIds: [] }),
    ).toContain('rider');
    expect(resolveAccess({ riderVerifiedAt: null, riderStatus: 'available', restaurantIds: [] })).not.toContain('rider');
    expect(
      resolveAccess({ riderVerifiedAt: '2026-08-20T00:00:00Z', riderStatus: 'suspended', restaurantIds: [] }),
    ).not.toContain('rider');
  });

  it('deriva staff y admin solo de fuentes protegidas', () => {
    expect(resolveAccess({ restaurantIds: ['restaurant-1'] })).toContain('restaurant_staff');
    expect(resolveAccess({ restaurantIds: [], platformRole: 'platform_admin' })).toContain('platform_admin');
    expect(resolveAccess({ restaurantIds: [], platformRole: 'customer' })).not.toContain('platform_admin');
  });
});
