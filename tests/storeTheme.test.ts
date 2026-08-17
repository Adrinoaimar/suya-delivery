import { describe, expect, it } from 'vitest';
import { stores, products } from '@/data';

describe('negocio funcional El Tío Jhony', () => {
  const store = stores.find((item) => item.id === 'tio-jhony')!;
  const storeProducts = products.filter((product) => product.storeId === 'tio-jhony');

  it('ya no está en fase beta y tiene paleta propia', () => {
    expect(store.isBeta).toBeUndefined();
    expect(store.theme).toBeDefined();
    expect(store.theme?.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(store.theme?.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('usa el logotipo oficial en vez del placeholder dibujado', () => {
    expect(store.logo).toBe('/brand/stores/tio-jhony-logo.webp');
  });

  it('tiene un producto en cada sección declarada y ninguna sección huérfana', () => {
    const declared = new Set(store.sections);
    const used = new Set(storeProducts.map((product) => product.section));

    for (const section of declared) {
      expect(used.has(section)).toBe(true);
    }
    for (const section of used) {
      expect(declared.has(section)).toBe(true);
    }
  });

  it('todos los precios son positivos', () => {
    expect(storeProducts.length).toBeGreaterThan(0);
    for (const product of storeProducts) {
      expect(product.price).toBeGreaterThan(0);
    }
  });
});

describe('negocios con paleta propia no afectan a los demás', () => {
  it('solo los negocios con `theme` definido lo declaran', () => {
    const withTheme = stores.filter((store) => store.theme);
    expect(withTheme.map((store) => store.id)).toEqual(['tio-jhony']);
  });
});
