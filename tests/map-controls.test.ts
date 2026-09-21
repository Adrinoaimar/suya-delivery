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

  it('reserva una columna visual para atribución y apila estados sin taparla', () => {
    expect(source).toContain('attributionControl: false');
    expect(source).toContain('max-w-[52%]');
    expect(source).toContain('max-w-[43%]');
    expect(source).toContain('https://www.openstreetmap.org/copyright');
    expect(source).toContain('No se pudieron cargar algunas calles');
    expect(source).not.toContain('className="absolute inset-x-3 bottom-3 z-[500]');
  });
});
