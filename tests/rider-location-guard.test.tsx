import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRiderTrackingRunner } from '@/hooks/useRiderLocationGuard';
import { useRiderStore } from '@/store/riderStore';

const mocks = vi.hoisted(() => ({
  getPermission: vi.fn(),
  watch: vi.fn(),
  setAvailability: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  locationService: {
    getPermission: mocks.getPermission,
    watch: mocks.watch,
  },
  riderOperationsService: {
    setAvailability: mocks.setAvailability,
  },
  notificationService: { notify: mocks.notify },
}));

describe('useRiderTrackingRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRiderStore.setState({ available: true });
    mocks.getPermission.mockResolvedValue('granted');
    mocks.setAvailability.mockResolvedValue('offline');
    mocks.watch.mockImplementation((_onReading, onError) => {
      onError('GPS no disponible');
      return vi.fn();
    });
  });

  afterEach(() => {
    useRiderStore.setState({ available: false });
  });

  it('retira disponibilidad local y del servidor cuando el GPS falla', async () => {
    const { unmount } = renderHook(() => useRiderTrackingRunner());

    await waitFor(() => expect(mocks.setAvailability).toHaveBeenCalledWith(false));
    expect(useRiderStore.getState().available).toBe(false);
    unmount();
  });
});
