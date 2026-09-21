import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const checkoutSource = readFileSync(
  resolve(process.cwd(), 'src/pages/customer/CheckoutPage.tsx'),
  'utf8',
);
const guestOrderSource = readFileSync(
  resolve(process.cwd(), 'src/pages/customer/GuestOrderPage.tsx'),
  'utf8',
);

describe('privacidad de pedidos invitados', () => {
  it('no persiste el pedido completo con teléfono, dirección ni códigos en Web Storage', () => {
    const sources = `${checkoutSource}\n${guestOrderSource}`;
    expect(sources).not.toContain("sessionStorage.setItem('suya.guestOrder'");
    expect(sources).not.toContain("sessionStorage.getItem('suya.guestOrder'");
  });

  it('solo conserva el correo cuando el checkout opcional lo necesita', () => {
    expect(checkoutSource).toContain('if (needsGatewayEmail && form.email.trim())');
  });

  it('no guarda el payload de idempotencia con datos personales en claro', () => {
    const orderServiceSource = readFileSync(
      resolve(process.cwd(), 'src/lib/services/SupabaseOrderService.ts'),
      'utf8',
    );
    expect(orderServiceSource).toContain("subtle.digest(\n      'SHA-256'");
    expect(orderServiceSource).not.toContain('JSON.stringify({ signature, requestId, guestAccessToken })');
  });

  it('mantiene la recuperación mediante token y servidor', () => {
    expect(guestOrderSource).toContain('consumeGuestOrderTokenFromHash');
    expect(guestOrderSource).toMatch(/orderService\s*\.get\(id\)/);
  });

  it('no usa navegación ni caché local como autorización temporal', () => {
    expect(guestOrderSource).not.toContain('GuestOrderLocationState');
    expect(guestOrderSource).not.toContain('useOrderStore');
    expect(guestOrderSource).toContain('useState<Order | null>(null)');
    expect(guestOrderSource).toContain('useState(true)');
  });
});
