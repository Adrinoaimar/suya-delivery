import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDrivingRoute,
  isRoutingConfigured,
  parseOsrmRoute,
  ROUTING_UNAVAILABLE_MESSAGE,
  selectNextRouteInstruction,
} from '@/lib/routePlanner';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('planificador vial OSRM', () => {
  it('no envía coordenadas a un router público cuando no hay endpoint privado', async () => {
    vi.stubEnv('VITE_ROUTING_URL', 'https://router.project-osrm.org');
    const request = vi.spyOn(globalThis, 'fetch');

    expect(isRoutingConfigured()).toBe(false);
    await expect(
      fetchDrivingRoute({ lat: -4.9, lng: -80.69 }, { lat: -4.91, lng: -80.68 }),
    ).rejects.toThrow(ROUTING_UNAVAILABLE_MESSAGE);
    expect(request).not.toHaveBeenCalled();
  });

  it('usa solo un endpoint HTTPS autorizado cuando se configura', async () => {
    vi.stubEnv('VITE_ROUTING_URL', 'https://routing.suya.test/');
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        code: 'Ok',
        routes: [{
          distance: 100,
          duration: 40,
          geometry: { coordinates: [[-80.69, -4.9], [-80.68, -4.91]] },
          legs: [],
        }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await fetchDrivingRoute({ lat: -4.9, lng: -80.69 }, { lat: -4.91, lng: -80.68 });

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('https://routing.suya.test/route/v1/driving/-80.69,-4.9;-80.68,-4.91'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

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

  it('avanza la guía al cruzar una maniobra y no vuelve a mostrar el giro anterior', () => {
    const turn = {
      text: 'Gira a la derecha',
      direction: 'right' as const,
      distanceMeters: 200,
      durationSeconds: 30,
      position: { lat: -4.9, lng: -80.69 },
    };
    const arrival = {
      text: 'Llegaste al punto de entrega',
      direction: 'arrive' as const,
      distanceMeters: 0,
      durationSeconds: 0,
      position: { lat: -4.901, lng: -80.69 },
    };

    const approaching = selectNextRouteInstruction(
      [turn, arrival],
      { lat: -4.8998, lng: -80.69 },
      { lat: -4.8996, lng: -80.69 },
    );
    expect(approaching.instruction).toBe(turn);

    const crossed = selectNextRouteInstruction(
      [turn, arrival],
      { lat: -4.9004, lng: -80.69 },
      { lat: -4.8998, lng: -80.69 },
      approaching.index,
    );
    expect(crossed.instruction).toBe(arrival);
  });
});
