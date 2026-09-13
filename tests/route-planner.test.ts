import { describe, expect, it } from 'vitest';
import { parseOsrmRoute } from '@/lib/routePlanner';

describe('planificador vial OSRM', () => {
  it('valida la geometría y convierte las maniobras a guía en español', () => {
    const plan = parseOsrmRoute({
      code: 'Ok',
      routes: [
        {
          distance: 1240,
          duration: 310,
          geometry: {
            coordinates: [
              [-80.6857, -4.8987],
              [-80.689, -4.896],
              [-80.6942, -4.889],
            ],
          },
          legs: [
            {
              steps: [
                {
                  distance: 220,
                  duration: 50,
                  name: 'Calle 5',
                  maneuver: {
                    type: 'depart',
                    location: [-80.6857, -4.8987],
                  },
                },
                {
                  distance: 620,
                  duration: 150,
                  name: 'Avenida Buenos Aires',
                  maneuver: {
                    type: 'turn',
                    modifier: 'right',
                    location: [-80.689, -4.896],
                  },
                },
                {
                  distance: 0,
                  duration: 0,
                  name: '',
                  maneuver: {
                    type: 'arrive',
                    location: [-80.6942, -4.889],
                  },
                },
              ],
            },
          ],
        },
        {
          distance: 1400,
          duration: 350,
          geometry: {
            coordinates: [
              [-80.6857, -4.8987],
              [-80.6942, -4.889],
            ],
          },
        },
      ],
    });

    expect(plan.geometry).toHaveLength(3);
    expect(plan.distanceMeters).toBe(1240);
    expect(plan.alternatives).toHaveLength(1);
    expect(plan.instructions[1]).toMatchObject({
      direction: 'right',
      text: 'Gira a la derecha por Avenida Buenos Aires',
    });
  });

  it('rechaza una respuesta que no sea una ruta válida', () => {
    expect(() => parseOsrmRoute({ code: 'NoRoute', routes: [] })).toThrow(
      'El motor de rutas no devolvió una ruta válida.',
    );
  });
});
