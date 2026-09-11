import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (path: string) => resolve(process.cwd(), path);

describe('activos de marca de restaurantes', () => {
  it('conserva activos publicados y la carta original de Andá Paya', () => {
    expect(existsSync(root('public/brand/stores/tio-jhony-logo.webp'))).toBe(true);
    expect(existsSync(root('public/brand/stores/la-waka-logo.svg'))).toBe(true);
    expect(existsSync(root('public/images/stores/donde-joel/logo.png'))).toBe(true);
    expect(existsSync(root('public/brand/stores/anda-paya-logo.webp'))).toBe(true);
    expect(existsSync(root('public/images/stores/anda-paya/menus/carta-2026-09-06.jpg'))).toBe(true);
  });

  it('no vuelve a presentar el SVG recreado como identidad de Andá Paya', () => {
    const card = readFileSync(root('src/components/marketplace/StoreCard.tsx'), 'utf8');
    const detail = readFileSync(root('src/pages/customer/StoreDetailPage.tsx'), 'utf8');
    expect(card).not.toContain('anda-paya.svg');
    expect(detail).not.toContain('anda-paya.svg');
  });

  it('conecta el logo autorizado de Andá Paya al catálogo local', () => {
    const stores = JSON.parse(readFileSync(root('src/data/stores.json'), 'utf8')) as Array<{
      id: string;
      logo?: string | null;
      isRealBrand?: boolean;
    }>;
    const andaPaya = stores.find((store) => store.id === 'anda-paya');
    expect(andaPaya).toMatchObject({
      isRealBrand: true,
      logo: '/brand/stores/anda-paya-logo.webp',
    });
  });
});
