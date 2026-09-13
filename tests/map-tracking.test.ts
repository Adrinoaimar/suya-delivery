import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (path: string) => resolve(process.cwd(), path);

describe('seguimiento visual del mapa', () => {
  it('conserva el rastro real del rider y un control de mapa accesible', () => {
    const map = readFileSync(root('src/components/map/LeafletMap.tsx'), 'utf8');
    const customerTrack = readFileSync(root('src/pages/customer/OrderTrackPage.tsx'), 'utf8');

    expect(map).toContain('riderTrailLineRef');
    expect(map).toContain("color: '#8CC63F'");
    expect(map).toContain('LocateFixed');
    expect(map).toContain('Recorrido real');
    expect(map).toContain('fetchDrivingRoute');
    expect(map).toContain('Ruta alternativa');
    expect(map).toContain('Guía vial no disponible');
    expect(readFileSync(root('src/pages/rider/RiderCurrentPage.tsx'), 'utf8')).toContain(
      'navigation',
    );
    expect(customerTrack).toContain('const mapPoints = useMemo(');
  });
});
