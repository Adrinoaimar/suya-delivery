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

  it('mantiene la recuperación mediante token y servidor', () => {
    expect(guestOrderSource).toContain('consumeGuestOrderTokenFromHash');
    expect(guestOrderSource).toMatch(/orderService\s*\.get\(id\)/);
  });
});
