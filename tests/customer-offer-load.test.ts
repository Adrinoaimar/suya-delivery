import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const homeSource = readFileSync(resolve(process.cwd(), 'src/pages/customer/HomePage.tsx'), 'utf8');
const checkoutSource = readFileSync(resolve(process.cwd(), 'src/pages/customer/CheckoutPage.tsx'), 'utf8');

describe('cargas de ofertas del Cliente', () => {
  it('ignora la respuesta de Inicio después de desmontar', () => {
    expect(homeSource).toContain('let active = true;');
    expect(homeSource).toContain('if (active) setOffers(rows);');
    expect(homeSource).toContain('active = false;');
  });

  it('ignora la respuesta de Checkout después de desmontar', () => {
    expect(checkoutSource).toContain('let active = true;');
    expect(checkoutSource).toContain('if (active) setOffers(rows);');
    expect(checkoutSource).toContain('active = false;');
  });
});
