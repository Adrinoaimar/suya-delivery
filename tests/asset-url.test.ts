import { describe, expect, it } from 'vitest';
import { assetUrl, normalizeAssetInput } from '@/utils/asset';

describe('rutas de activos publicados', () => {
  it('resuelve rutas locales con la base pública de Vite', () => {
    expect(assetUrl('/images/stores/donde-joel/logo.png')).toMatch(/images\/stores\/donde-joel\/logo\.png$/);
  });

  it('conserva URLs remotas y datos embebidos', () => {
    expect(assetUrl('https://cdn.example.test/logo.webp')).toBe('https://cdn.example.test/logo.webp');
    expect(assetUrl('data:image/png;base64,AA==')).toBe('data:image/png;base64,AA==');
  });

  it('rechaza esquemas ejecutables y SVG inline', () => {
    expect(assetUrl('javascript:alert(1)')).toBeUndefined();
    expect(assetUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBeUndefined();
  });

  it('normaliza referencias editables y conserva SVG locales o remotos', () => {
    expect(normalizeAssetInput('  /brand/stores/logo.svg  ')).toBe('/brand/stores/logo.svg');
    expect(normalizeAssetInput('https://cdn.example.test/logo.svg')).toBe('https://cdn.example.test/logo.svg');
    expect(normalizeAssetInput('   ')).toBeNull();
  });

  it('rechaza referencias editables con esquemas no renderizables', () => {
    expect(() => normalizeAssetInput('javascript:alert(1)')).toThrow('La imagen debe usar');
    expect(() => normalizeAssetInput('data:image/svg+xml,<svg onload=alert(1)>')).toThrow('La imagen debe usar');
  });
});
