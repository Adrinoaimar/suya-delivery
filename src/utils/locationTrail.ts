import type { LatLng } from '@/types';
import { distanceKm } from './geo';

/** Límite visual para mantener el mapa fluido incluso en viajes largos. */
export const MAX_TRACK_POINTS = 240;

export function appendTrail(trail: LatLng[], position: LatLng): LatLng[] {
  const last = trail.at(-1);
  if (last && distanceKm(last, position) < 0.004) return trail;
  return [...trail, position].slice(-MAX_TRACK_POINTS);
}

/** Fusiona historial (antiguo→nuevo) con lecturas en vivo sin invertir el recorrido. */
export function mergeTrails(history: LatLng[], liveTrail: LatLng[]): LatLng[] {
  return [...history, ...liveTrail].reduce<LatLng[]>(appendTrail, []);
}
