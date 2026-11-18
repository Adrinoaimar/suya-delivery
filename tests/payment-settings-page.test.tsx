import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentSettingsPage from '@/pages/backoffice/PaymentSettingsPage';
import { useBackofficeContextStore } from '@/store/backofficeContextStore';
import type { GatewayAdminResult, PaymentGatewayConfig } from '@/lib/services/SupabasePaymentGatewayService';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@/lib/services', () => ({ paymentGatewayService: { admin: mocks.admin } }));

function config(patch: Partial<PaymentGatewayConfig> = {}): PaymentGatewayConfig {
  return {
    restaurant_id: 'restaurant-one', provider: 'mercadopago', environment: 'test', version: 1,
    collector_id: null, enabled: false, verified_at: null, webhook_verified_at: null,
    production_permissions_confirmed: false, has_credentials: false,
    webhook_url: 'https://suya.example/functions/v1/payment-webhook', ...patch,
  };
}
function page() {
  return render(<MemoryRouter initialEntries={['/backoffice/payment-settings']}><PaymentSettingsPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  useBackofficeContextStore.setState({ activeRestaurantId: 'restaurant-one' });
  mocks.admin.mockResolvedValue({ config: config(), payments: { payments: [], events: [] } });
});

describe('Configuración de cobros — acciones reales y activación protegida', () => {
  it('pide seleccionar sede antes de enviar solicitudes', async () => {
    useBackofficeContextStore.setState({ activeRestaurantId: '' });
    page();
    expect(screen.getByText('Selecciona un restaurante para configurar los cobros.')).toBeInTheDocument();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('no ofrece conexión ni activación sin credenciales verificadas', async () => {
    page();
    await screen.findByText('No activo — requiere credenciales y comprobación');
    expect(screen.getByRole('button', { name: 'Guardar credenciales' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Comprobar conexión' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Realizar prueba segura' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Activar cobro automático' })).toBeDisabled();
  });

  it('guarda secretos por servicio y los borra del formulario al terminar', async () => {
    mocks.admin.mockImplementation(async (action: string) => ({ config: config({ has_credentials: action !== 'admin-read' }) }));
    page();
    await waitFor(() => expect(screen.getByLabelText('Access Token oficial')).toBeEnabled());
    const token = screen.getByLabelText('Access Token oficial');
    const secret = screen.getByLabelText('Clave secreta de firma de Webhooks');
    expect(token).toHaveAttribute('type', 'password');
    expect(secret).toHaveAttribute('type', 'password');
    fireEvent.change(token, { target: { value: 'TEST-local-credential' } });
    fireEvent.change(secret, { target: { value: 'signature-fixture' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar credenciales' }));
    await waitFor(() => expect(mocks.admin).toHaveBeenCalledWith('admin-save', expect.objectContaining({
      restaurantId: 'restaurant-one', environment: 'test', accessToken: 'TEST-local-credential',
      webhookSecret: 'signature-fixture', productionPermissionsConfirmed: false, expectedVersion: 1,
    })));
    await waitFor(() => expect(token).toHaveValue(''));
    expect(secret).toHaveValue('');
    expect(document.body.textContent).not.toContain('TEST-local-credential');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('comprueba conexión y mantiene cobro real apagado en entorno de prueba', async () => {
    let current = config({ has_credentials: true });
    mocks.admin.mockImplementation(async (action: string) => {
      if (action === 'admin-check') current = { ...current, verified_at: '2026-11-16T10:00:00Z', collector_id: 'collector-one' };
      return { config: current };
    });
    page();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Comprobar conexión' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar conexión' }));
    await screen.findByText('Conectado — cobro real desactivado');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Activar cobro automático' })).toBeDisabled();
    expect(mocks.admin).toHaveBeenCalledWith('admin-check', { restaurantId: 'restaurant-one', expectedVersion: 1 });
  });

  it('activa solo live verificado y con permisos confirmados, sin reenviar claves', async () => {
    let current = config({ environment: 'live', has_credentials: true, verified_at: '2026-11-16T10:00:00Z', webhook_verified_at: '2026-11-16T10:01:00Z' });
    mocks.admin.mockImplementation(async (action: string) => {
      if (action === 'admin-activate') current = { ...current, enabled: true, production_permissions_confirmed: true };
      return { config: current };
    });
    page();
    await screen.findByText('Conectado — cobro real desactivado');
    expect(screen.getByRole('button', { name: 'Activar cobro automático' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Activar cobro automático' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Activar cobro automático' }));
    await screen.findByText('Activo — confirmación automática por API oficial');
    expect(mocks.admin).toHaveBeenCalledWith('admin-activate', {
      restaurantId: 'restaurant-one', expectedVersion: 1, enabled: true, productionPermissionsConfirmed: true,
    });
    expect(screen.getByRole('button', { name: 'Realizar prueba segura' })).toBeDisabled();
  });

  it.each([
    'https://evil.example/checkout/pago',
    'https://www.mercadopago.com.pe.evil.example/checkout/pago',
    'javascript:alert(1)',
    'https://user:password@www.mercadopago.com.pe/checkout/pago',
  ])('no enlaza una URL de prueba no autorizada: %s', async (sandboxCheckoutUrl) => {
    mocks.admin.mockImplementation(async (action: string) => ({
      config: config({ has_credentials: true }), ...(action === 'admin-safe-test' ? { sandboxCheckoutUrl } : {}),
    }));
    page();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Realizar prueba segura' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Realizar prueba segura' }));
    await waitFor(() => expect(mocks.admin).toHaveBeenCalledWith('admin-safe-test', expect.anything()));
    expect(screen.queryByRole('link', { name: 'Abrir pago de prueba en Mercado Pago' })).not.toBeInTheDocument();
  });

  it('abre solamente checkout sandbox del proveedor y aclara que no acredita un pago real', async () => {
    mocks.admin.mockImplementation(async (action: string) => ({
      config: config({ has_credentials: true }),
      ...(action === 'admin-safe-test' ? { sandboxCheckoutUrl: 'https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=fixture' } : {}),
    }));
    page();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Realizar prueba segura' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Realizar prueba segura' }));
    const link = await screen.findByRole('link', { name: 'Abrir pago de prueba en Mercado Pago' });
    expect(link).toHaveAttribute('href', 'https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=fixture');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/La comprobación de conexión no acredita un pago real/)).toBeInTheDocument();
  });

  it('explica el QR personal como recepción con revisión y navega a la configuración existente', async () => {
    page();
    await screen.findByText('No activo — requiere credenciales y comprobación');
    fireEvent.change(screen.getByLabelText('Método receptor'), { target: { value: 'manual' } });
    expect(screen.getByText(/Un QR estático permite recibir dinero; no permite verificar automáticamente/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurar el QR y consultar observaciones' })).toHaveAttribute('href', '/backoffice/wallets');
    expect(screen.queryByRole('button', { name: 'Activar cobro automático' })).not.toBeInTheDocument();
  });

  it('ignora la respuesta operativa de una sede anterior al cambiar de restaurante', async () => {
    let resolveCheck: (result: GatewayAdminResult) => void = () => undefined;
    const checkPending = new Promise<GatewayAdminResult>((resolve) => { resolveCheck = resolve; });
    mocks.admin.mockImplementation(async (action: string, body: { restaurantId: string }) => {
      if (action === 'admin-check') return checkPending;
      return { config: config({ restaurant_id: body.restaurantId, collector_id: body.restaurantId === 'restaurant-two' ? 'collector-two' : 'collector-one', has_credentials: true }) };
    });
    page();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Comprobar conexión' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar conexión' }));
    act(() => useBackofficeContextStore.setState({ activeRestaurantId: 'restaurant-two' }));
    await screen.findByText(/Cuenta receptora: collector-two/);
    await act(async () => resolveCheck({ config: config({ collector_id: 'collector-one', verified_at: '2026-11-16T10:00:00Z' }), message: 'Respuesta de la sede anterior' }));
    expect(screen.getByText(/Cuenta receptora: collector-two/)).toBeInTheDocument();
    expect(screen.queryByText('Respuesta de la sede anterior')).not.toBeInTheDocument();
  });
});

describe('recepción firmada como requisito independiente', () => {
  it.each([
    { has_credentials: false, webhook_verified_at: '2026-11-16T10:00:00Z' },
    { has_credentials: true, webhook_verified_at: null },
  ])('mantiene activación apagada si falta credencial o firma: %j', async (patch) => {
    mocks.admin.mockResolvedValue({ config: config({
      environment: 'live', verified_at: '2026-11-16T10:00:00Z', enabled: false,
      production_permissions_confirmed: true, ...patch,
    }) });
    page();
    await screen.findByText('Conectado — cobro real desactivado');
    expect(screen.getByRole('button', { name: 'Activar cobro automático' })).toBeDisabled();
  });

  it('no anuncia activo un estado incompleto aunque venga marcado enabled', async () => {
    mocks.admin.mockResolvedValue({ config: config({
      environment: 'live', verified_at: '2026-11-16T10:00:00Z', enabled: true,
      has_credentials: true, webhook_verified_at: null, production_permissions_confirmed: true,
    }) });
    page();
    await screen.findByText('Conectado — cobro real desactivado');
    expect(screen.queryByText('Activo — confirmación automática por API oficial')).not.toBeInTheDocument();
    expect(screen.getByText('Firma de Webhooks pendiente de verificar')).toBeInTheDocument();
  });

  it('permite actualizar la comprobación de firma sin iniciar un cobro', async () => {
    let refreshed = false;
    mocks.admin.mockImplementation(async () => ({ config: config({
      has_credentials: true, verified_at: '2026-11-16T10:00:00Z',
      webhook_verified_at: refreshed ? '2026-11-16T10:01:00Z' : null,
    }) }));
    page();
    await screen.findByText('Firma de Webhooks pendiente de verificar');
    expect(screen.getByRole('link', { name: 'Ver instrucciones oficiales de Webhooks' })).toHaveAttribute('href', 'https://www.mercadopago.com.pe/developers/es/docs/your-integrations/notifications/webhooks');
    refreshed = true;
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar verificación' }));
    await screen.findByText('Firma de Webhooks verificada');
    expect(mocks.admin.mock.calls.every((call) => call[0] === 'admin-read')).toBe(true);
  });
});
