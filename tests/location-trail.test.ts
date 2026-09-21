import { describe, expect, it } from 'vitest';
import { appendTrail, mergeTrails, MAX_TRACK_POINTS } from '@/utils/locationTrail';

describe('rastro GPS', () => {
  it('mantiene orden, elimina ruido corto y limita el tamaño', () => {
    const first = { lat: -4.89, lng: -80.69 };
    const nearby = { lat: -4.89001, lng: -80.69001 };
    const next = { lat: -4.891, lng: -80.691 };
    expect(appendTrail([first], nearby)).toEqual([first]);
    expect(mergeTrails([first, next], [next])).toEqual([first, next]);

    const longTrail = Array.from({ length: MAX_TRACK_POINTS + 20 }, (_, index) => ({
      lat: -4.89 + index * 0.001,
      lng: -80.69 + index * 0.001,
    }));
    expect(mergeTrails(longTrail, [])).toHaveLength(MAX_TRACK_POINTS);
    expect(mergeTrails(longTrail, []).at(-1)).toEqual(longTrail.at(-1));
  });
});
