import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderTrackingPanel } from '@/components/order/OrderTrackingPanel';
import type { MapViewProps } from '@/components/map/types';
import type { Order } from '@/types';

const mocks = vi.hoisted(() => ({
  locationHistory: vi.fn(),
  subscribeLocation: vi.fn(),
}));

vi.mock('@/components/map/MapProvider', () => ({
  MapProvider: ({ label, rider, riderTrail }: MapViewProps) => (
    <div
      role="img"
      aria-label={label}
      data-rider-lat={rider?.lat ?? ''}
      data-trail-count={riderTrail?.length ?? 0}
    />
  ),
}));

vi.mock('@/lib/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services')>()),
  safetyOperationsService: {
    locationHistory: mocks.locationHistory,
    subscribeLocation: mocks.subscribeLocation,
  },
}));

const order: Order = {
  id: 'order-track-1',
  code: 'SUY-TRACK1',
  storeId: 'store-1',
  storeName: 'Negocio de prueba',
  items: [],
  subtotal: 20,
  deliveryFee: 3,
  discount: 0,
  total: 23,
  createdAt: '2026-09-26T10:00:00.000Z',
  status: 'preparing',
  history: [{ status: 'confirmed', at: '2026-09-26T10:01:00.000Z' }],
  customer: {
    name: 'Cliente',
    phone: '900000000',
    address: 'Dirección confirmada',
    reference: 'Referencia',
  },
  deliveryPosition: { lat: -4.91, lng: -80.68 },
  storePosition: { lat: -4.89, lng: -80.69 },
  paymentMethod: 'cash',
  riderId: 'rider-1',
  etaMinutes: 20,
  deliveryCode: '1234',
  cancelCode: '5678',
  origin: 'delivery',
  paymentIntent: null,
};

describe('seguimiento del pedido en cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locationHistory.mockResolvedValue([]);
    mocks.subscribeLocation.mockReturnValue(() => undefined);
  });

  it('oculta mapa y GPS mientras el pago sigue pendiente', () => {
    render(
      <OrderTrackingPanel
        order={{
          ...order,
          status: 'pending_payment',
          paymentMethod: 'yape',
          paymentIntent: {
            attemptId: 'attempt-1',
            orderId: order.id,
            method: 'yape',
            status: 'pending',
            amount: order.total,
            currency: 'PEN',
            checkoutReference: 'SUYA-TRACK',
            expiresAt: '2026-09-26T11:00:00.000Z',
            provider: 'yape',
            providerReference: null,
            qrPayload: null,
          },
        }}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Seguimiento del pedido' })).not.toBeInTheDocument();
    expect(mocks.locationHistory).not.toHaveBeenCalled();
    expect(mocks.subscribeLocation).not.toHaveBeenCalled();
  });

  it('muestra estado y puntos confirmados antes de la recogida sin consultar GPS', () => {
    render(<OrderTrackingPanel order={order} />);

    expect(screen.getByRole('heading', { name: 'Seguimiento del pedido' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Mapa de seguimiento del pedido/ })).toBeInTheDocument();
    expect(screen.getByText('El negocio está preparando tu pedido.')).toBeInTheDocument();
    expect(screen.getByText('El mapa mostrará la ubicación del repartidor cuando recoja tu pedido.')).toBeInTheDocument();
    expect(mocks.locationHistory).not.toHaveBeenCalled();
    expect(mocks.subscribeLocation).not.toHaveBeenCalled();
  });

  it('combina historial autorizado con nuevas ubicaciones y libera la suscripción', async () => {
    const priorLocation = { lat: -4.90, lng: -80.69 };
    const nextLocation = { lat: -4.88, lng: -80.68 };
    let publishLocation: ((position: typeof nextLocation) => void) | undefined;
    const unsubscribe = vi.fn();
    mocks.locationHistory.mockResolvedValue([priorLocation]);
    mocks.subscribeLocation.mockImplementation(
      (_orderId: string, listener: (position: typeof nextLocation) => void) => {
        publishLocation = listener;
        return unsubscribe;
      },
    );

    const { unmount } = render(
      <OrderTrackingPanel order={{ ...order, status: 'on_the_way' }} />,
    );

    await waitFor(() => expect(mocks.locationHistory).toHaveBeenCalledWith(order.id));
    expect(mocks.subscribeLocation).toHaveBeenCalledWith(order.id, expect.any(Function));
    const map = screen.getByRole('img', { name: /Mapa de seguimiento del pedido/ });
    await waitFor(() => expect(map).toHaveAttribute('data-rider-lat', String(priorLocation.lat)));
    expect(map).toHaveAttribute('data-trail-count', '1');

    act(() => publishLocation?.(nextLocation));
    await waitFor(() => expect(map).toHaveAttribute('data-rider-lat', String(nextLocation.lat)));
    expect(map).toHaveAttribute('data-trail-count', '2');

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('distingue una señal reciente del último punto y descarta eventos atrasados', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-18T13:00:00Z'));
      const prior = { lat: -4.9, lng: -80.69, capturedAt: '2026-11-18T12:45:00Z' };
      const fresh = { lat: -4.88, lng: -80.68, capturedAt: '2026-11-18T13:00:00Z' };
      mocks.locationHistory.mockResolvedValue([prior]);
      const view = render(<OrderTrackingPanel order={{ ...order, status: 'on_the_way' }} />);
      await act(async () => {});
      expect(screen.getByText(/Última ubicación recibida a las/)).toBeVisible();
      const publish = mocks.subscribeLocation.mock.calls[0][1];
      act(() => publish(fresh));
      expect(screen.getByText('Señal GPS reciente del repartidor')).toBeVisible();
      act(() => publish(prior));
      expect(screen.getByRole('img', { name: /Mapa de seguimiento/ })).toHaveAttribute('data-rider-lat', String(fresh.lat));
      act(() => vi.advanceTimersByTime(91_000));
      expect(screen.getByText(/Última ubicación recibida a las/)).toBeVisible();
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('no expone el mapa para un pedido de mesa', () => {
    render(
      <OrderTrackingPanel
        order={{ ...order, origin: 'table_qr', tableId: 'table-1' }}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Seguimiento del pedido' })).not.toBeInTheDocument();
    expect(mocks.locationHistory).not.toHaveBeenCalled();
  });
});
