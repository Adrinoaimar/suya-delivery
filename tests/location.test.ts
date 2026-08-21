import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserLocationServiceImpl } from '@/lib/services/BrowserLocationService';
import { boundsOf, distanceKm, pointAtProgress, projectToUnit } from '@/utils/geo';
import { demoRoute } from '@/data';

describe('ubicación', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('informa cuando el navegador no tiene geolocalización', () => {
    const service = new BrowserLocationServiceImpl();
    const original = navigator.geolocation;
    // jsdom no implementa geolocation: se fuerza su ausencia
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });

    const onError = vi.fn();
    const stop = service.watch(vi.fn(), onError);

    expect(service.isSupported()).toBe(false);
    expect(onError).toHaveBeenCalledWith('Este navegador no permite acceder a la ubicación.');
    stop();

    Object.defineProperty(navigator, 'geolocation', { value: original, configurable: true });
  });

  it('avisa del error cuando se rechaza el permiso', () => {
    const service = new BrowserLocationServiceImpl();
    const watchPosition = vi.fn((_success, error: (err: unknown) => void) => {
      error({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      return 7;
    });
    Object.defineProperty(navigator, 'geolocation', {
      value: { watchPosition, clearWatch: vi.fn() },
      configurable: true,
    });

    const onError = vi.fn();
    service.watch(vi.fn(), onError);

    expect(onError).toHaveBeenCalledWith('No tenemos permiso para acceder a tu ubicación.');
  });

  it('interpola la posición sin saltos entre puntos', () => {
    const start = pointAtProgress(demoRoute.points, 0);
    const middle = pointAtProgress(demoRoute.points, 0.5);
    const end = pointAtProgress(demoRoute.points, 1);

    expect(start).toEqual(demoRoute.points[0]);
    expect(end).toEqual(demoRoute.points.at(-1));
    expect(distanceKm(start, middle)).toBeGreaterThan(0);
    expect(distanceKm(middle, end)).toBeGreaterThan(0);

    const quarter = pointAtProgress(demoRoute.points, 0.25);
    const nextQuarter = pointAtProgress(demoRoute.points, 0.26);
    expect(distanceKm(quarter, nextQuarter)).toBeLessThan(0.1);
  });

  it('proyecta coordenadas a un plano normalizado', () => {
    const bounds = boundsOf(demoRoute.points, 0);
    const unit = projectToUnit(demoRoute.points[0]!, bounds);

    expect(unit.x).toBeGreaterThanOrEqual(0);
    expect(unit.x).toBeLessThanOrEqual(1);
    expect(unit.y).toBeGreaterThanOrEqual(0);
    expect(unit.y).toBeLessThanOrEqual(1);
  });
});
