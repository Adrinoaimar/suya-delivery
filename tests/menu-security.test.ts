import { describe, expect, it } from 'vitest';
import { safeHexColor, safeImageUrl } from '../apps/menu/security.js';

describe('Suya Menús image URLs', () => {
  it('accepts only six-digit hex colors for CSS variables', () => {
    expect(safeHexColor('#0E6B44')).toBe('#0E6B44');
    expect(safeHexColor('#fff; background:url(https://attacker.invalid)')).toBe('#0B7048');
  });

  it('rejects executable schemes and CSS declaration injection', () => {
    expect(safeImageUrl('javascript:alert(1)', 'https://menu.suya.test/')).toBe('');
    expect(safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>', 'https://menu.suya.test/')).toBe('');
    expect(
      safeImageUrl("x');background-image:url(https://attacker.invalid/leak)", 'https://menu.suya.test/'),
    ).toBe('');
  });

  it('allows HTTPS, same-development HTTP, relative, and raster data images', () => {
    expect(safeImageUrl('https://cdn.suya.test/dish.webp', 'https://menu.suya.test/')).toBe(
      'https://cdn.suya.test/dish.webp',
    );
    expect(safeImageUrl('/dish.webp', 'https://menu.suya.test/menu')).toBe(
      'https://menu.suya.test/dish.webp',
    );
    expect(safeImageUrl('http://localhost:4173/dish.webp', 'http://localhost:4173/')).toBe(
      'http://localhost:4173/dish.webp',
    );
    expect(safeImageUrl('data:image/png;base64,AA==', 'https://menu.suya.test/')).toBe(
      'data:image/png;base64,AA==',
    );
  });

  it('blocks HTTP images on HTTPS pages', () => {
    expect(safeImageUrl('http://cdn.suya.test/dish.webp', 'https://menu.suya.test/')).toBe('');
  });
});
