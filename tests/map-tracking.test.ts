import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (path: string) => resolve(process.cwd(), path);

describe('seguimiento visual del mapa', () => {
  it('conserva el rastro real del rider y un control de mapa accesible', () => {
    const map = readFileSync(root('src/components/map/LeafletMap.tsx'), 'utf8');
    const customerTrack = readFileSync(root('src/pages/customer/OrderTrackPage.tsx'), 'utf8');

    expect(map).toContain('riderTrailLineRef');
    expect(map).toContain('historicalTrail');
    expect(map).toContain('riderTrail: historicalTrail = EMPTY_TRAIL');
    expect(map).toContain('const EMPTY_TRAIL: LatLng[] = []');
    expect(map).toContain('MAX_TRACK_POINTS');
    expect(map).toContain('setLatLngs(riderTrailRef.current)');
    expect(map).toContain('Si la última lectura falla, conserva el rastro histórico');
    expect(map).toContain('if (historicalTrail.length === 0)');
    expect(map).toContain("color: '#8CC63F'");
    expect(map).toContain('LocateFixed');
    expect(map).toContain('zoomControl: false');
    expect(map).toContain('Acercar mapa');
    expect(map).toContain('Alejar mapa');
    expect(map).toContain('right-[7.25rem]');
    expect(map).toContain('Recorrido real');
    expect(map).toContain('fetchDrivingRoute');
    expect(map).toContain('Ruta alternativa');
    expect(map).toContain('Ruta vial no disponible');
    expect(map).not.toContain('drawFallbackRoute');
    expect(map).toContain('sin inventar una línea recta');
    expect(map).toContain('if (!navigation) return undefined');
    expect(map).toContain('Activar modo noche');
    expect(map).toContain('Activar modo día');
    expect(map).toContain('hasAppliedInitialViewRef');
    expect(map).toContain('const routingRiderLat = navigation ? riderLat : undefined;');
    expect(map).toContain('routingRiderLng');
    expect(map).toContain('routeControllerRef');
    expect(map).toContain('routeRequestIdRef');
    expect(map).toContain('requestId !== routeRequestIdRef.current');
    expect(map).toContain('No cancelar aquí: una lectura GPS menor al umbral');
    expect(map).not.toContain('return () => controller.abort()');
    expect(map).toContain('Ver mapa completo');
    expect(map).toContain('Salir del mapa completo');
    expect(map).toContain("!mapExpanded && 'relative'");
    expect(map).toContain('requestAnimationFrame');
    expect(map).toContain("typeof ResizeObserver === 'function'");
    expect(map).toContain("window.addEventListener('resize', handleResize)");
    expect(map).toContain('}, [interactive]);');
    expect(readFileSync(root('src/pages/rider/RiderCurrentPage.tsx'), 'utf8')).toContain(
      'navigation',
    );
    expect(readFileSync(root('src/pages/rider/RiderCurrentPage.tsx'), 'utf8')).toContain(
      'key={active.id}',
    );
    expect(readFileSync(root('src/pages/rider/RiderCurrentPage.tsx'), 'utf8')).toContain(
      'locationHistory(activeId)',
    );
    expect(readFileSync(root('src/pages/rider/RiderCurrentPage.tsx'), 'utf8')).toContain(
      'mergeTrails(history, trail)',
    );
    expect(readFileSync(root('src/pages/rider/RiderCurrentPage.tsx'), 'utf8')).toContain(
      'appendTrail(trail, reading.position)',
    );
    expect(customerTrack).toContain('key={order.id}');
    const riderHome = readFileSync(root('src/pages/rider/RiderHomePage.tsx'), 'utf8');
    expect(riderHome).toContain('<MapProvider');
    expect(riderHome).toContain('Mapa de tu ubicación y zona de reparto');
    expect(riderHome).toContain('h-[min(58dvh,520px)]');
    expect(riderHome).toContain('Siguiendo tu ruta de entrega');
    expect(customerTrack).toContain('const mapPoints = useMemo(');
    expect(customerTrack).toContain('locationHistory(order.id)');
    expect(customerTrack).toContain('mergeTrails(history, trail)');
    expect(customerTrack).toContain('riderTrail={cancelled ? [] : riderTrail}');
    expect(customerTrack).toContain('h-[54%]');
  });
});
