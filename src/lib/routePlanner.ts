import type { LatLng } from '@/types';

export const DEFAULT_ROUTING_URL = 'https://router.project-osrm.org';

export type RouteDirection =
  | 'arrive'
  | 'depart'
  | 'left'
  | 'right'
  | 'straight'
  | 'uturn'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'roundabout'
  | 'merge';

export interface RouteInstruction {
  text: string;
  direction: RouteDirection;
  distanceMeters: number;
  durationSeconds: number;
  position: LatLng;
}

export interface RouteAlternative {
  geometry: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
}

export interface RoutePlan {
  geometry: LatLng[];
  instructions: RouteInstruction[];
  distanceMeters: number;
  durationSeconds: number;
  alternatives: RouteAlternative[];
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function finiteNumber(value: unknown): number | null {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function coordinate(value: unknown): LatLng | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = finiteNumber(value[0]);
  const lat = finiteNumber(value[1]);
  if (lng === null || lat === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

function geometryOf(route: JsonObject): LatLng[] {
  const geometry = object(route.geometry);
  const coordinates = geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return coordinates.flatMap((value) => {
    const point = coordinate(value);
    return point ? [point] : [];
  });
}

function modifierDirection(modifier: string, type: string): RouteDirection {
  if (type === 'roundabout' || type === 'rotary') return 'roundabout';
  if (type === 'merge') return 'merge';
  if (modifier === 'uturn') return 'uturn';
  if (modifier === 'left' || modifier === 'slight left' || modifier === 'sharp left') {
    return modifier === 'slight left'
      ? 'slight-left'
      : modifier === 'sharp left'
        ? 'sharp-left'
        : 'left';
  }
  if (modifier === 'right' || modifier === 'slight right' || modifier === 'sharp right') {
    return modifier === 'slight right'
      ? 'slight-right'
      : modifier === 'sharp right'
        ? 'sharp-right'
        : 'right';
  }
  if (type === 'arrive') return 'arrive';
  return type === 'depart' ? 'depart' : 'straight';
}

function directionText(direction: RouteDirection, street: string): string {
  const suffix = street ? ` por ${street}` : '';
  switch (direction) {
    case 'arrive':
      return 'Llegaste al punto de entrega';
    case 'depart':
      return street ? `Sal por ${street}` : 'Inicia la ruta';
    case 'left':
      return `Gira a la izquierda${suffix}`;
    case 'right':
      return `Gira a la derecha${suffix}`;
    case 'slight-left':
      return `Mantente a la izquierda${suffix}`;
    case 'slight-right':
      return `Mantente a la derecha${suffix}`;
    case 'sharp-left':
      return `Gira cerrado a la izquierda${suffix}`;
    case 'sharp-right':
      return `Gira cerrado a la derecha${suffix}`;
    case 'uturn':
      return 'Haz un retorno';
    case 'roundabout':
      return street ? `Entra en la rotonda${suffix}` : 'Entra en la rotonda';
    case 'merge':
      return street ? `Incorpórate a ${street}` : 'Incorpórate a la vía';
    default:
      return street ? `Continúa por ${street}` : 'Continúa de frente';
  }
}

function instructionsOf(route: JsonObject): RouteInstruction[] {
  const legs = Array.isArray(route.legs) ? route.legs : [];
  return legs.flatMap((legValue) => {
    const leg = object(legValue);
    const steps = Array.isArray(leg?.steps) ? leg.steps : [];
    return steps.flatMap((stepValue) => {
      const step = object(stepValue);
      const maneuver = object(step?.maneuver);
      const position = coordinate(maneuver?.location);
      if (!position) return [];
      const type = text(maneuver?.type).toLowerCase();
      const modifier = text(maneuver?.modifier).toLowerCase();
      const direction = modifierDirection(modifier, type);
      const distanceMeters = Math.max(0, finiteNumber(step?.distance) ?? 0);
      const durationSeconds = Math.max(0, finiteNumber(step?.duration) ?? 0);
      const street = text(step?.name);
      return [
        {
          text: directionText(direction, street),
          direction,
          distanceMeters,
          durationSeconds,
          position,
        },
      ];
    });
  });
}

function routeSummary(route: JsonObject): RouteAlternative | null {
  const geometry = geometryOf(route);
  const distanceMeters = finiteNumber(route.distance);
  const durationSeconds = finiteNumber(route.duration);
  if (geometry.length < 2 || distanceMeters === null || durationSeconds === null) return null;
  return {
    geometry,
    distanceMeters: Math.max(0, distanceMeters),
    durationSeconds: Math.max(0, durationSeconds),
  };
}

/** Convierte y valida la respuesta de OSRM sin confiar en el payload remoto. */
export function parseOsrmRoute(value: unknown): RoutePlan {
  const payload = object(value);
  if (payload?.code !== 'Ok' || !Array.isArray(payload.routes) || payload.routes.length === 0) {
    throw new Error('El motor de rutas no devolvió una ruta válida.');
  }
  const summaries = payload.routes.flatMap((routeValue) => {
    const route = object(routeValue);
    if (!route) return [];
    const summary = routeSummary(route);
    return summary ? [{ route, summary }] : [];
  });
  const first = summaries[0];
  if (!first) throw new Error('La ruta vial no contiene suficientes coordenadas.');
  return {
    geometry: first.summary.geometry,
    instructions: instructionsOf(first.route),
    distanceMeters: first.summary.distanceMeters,
    durationSeconds: first.summary.durationSeconds,
    alternatives: summaries.slice(1).map(({ summary }) => summary),
  };
}

export async function fetchDrivingRoute(
  start: LatLng,
  end: LatLng,
  signal?: AbortSignal,
): Promise<RoutePlan> {
  const baseUrl = (import.meta.env.VITE_ROUTING_URL || DEFAULT_ROUTING_URL).replace(/\/+$/, '');
  const url = `${baseUrl}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&steps=true&geometries=geojson&alternatives=true`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`Routing HTTP ${response.status}`);
  return parseOsrmRoute(await response.json());
}
