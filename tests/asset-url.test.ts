import { describe, expect, it } from 'vitest';
import { assetUrl } from '@/utils/asset';

describe('rutas de activos publicados', () => {
  it('resuelve rutas locales con la base pública de Vite', () => {
    expect(assetUrl('/images/stores/donde-joel/logo.png')).toMatch(/images\/stores\/donde-joel\/logo\.png$/);
  });

  it('conserva URLs remotas y datos embebidos', () => {
    expect(assetUrl('https://cdn.example.test/logo.webp')).toBe('https://cdn.example.test/logo.webp');
    expect(assetUrl('data:image/png;base64,AA==')).toBe('data:image/png;base64,AA==');
  });
});
