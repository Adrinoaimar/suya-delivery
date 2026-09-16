import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/map/LeafletMap.tsx', 'utf8');

describe('controles accesibles del mapa', () => {
  it('mantiene zoom y acciones principales en objetivos de 44 px', () => {
    expect(source).toContain('aria-label="Acercar mapa"');
    expect(source).toContain('aria-label="Alejar mapa"');
    expect(source).toContain('aria-label={mapExpanded ? \'Salir del mapa completo\' : \'Ver mapa completo\'}');
    expect(source).not.toMatch(/className="[^"]*h-9 w-9/);
    expect(source.match(/className="[^"]*h-11 w-11/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
