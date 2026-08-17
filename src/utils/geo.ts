import type { LatLng } from '@/types';

const EARTH_RADIUS_KM = 6371;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) };
}

/**
 * Posición interpolada a lo largo de una polilínea.
 * `progress` va de 0 a 1; el marcador nunca «se teletransporta» entre puntos.
 */
export function pointAtProgress(points: LatLng[], progress: number): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  if (points.length === 1) return points[0]!;

  const clamped = Math.min(1, Math.max(0, progress));
  const segments = points.length - 1;
  const scaled = clamped * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  return lerpLatLng(points[index]!, points[index + 1]!, scaled - index);
}

/** Rumbo en grados (0 = norte) para orientar el ícono del repartidor. */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function boundsOf(points: LatLng[], padding = 0.0012): Bounds {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    minLat: Math.min(...lats) - padding,
    maxLat: Math.max(...lats) + padding,
    minLng: Math.min(...lngs) - padding,
    maxLng: Math.max(...lngs) + padding,
  };
}

/** Proyecta una coordenada a un plano XY normalizado (0–1) dentro de unos límites. */
export function projectToUnit(point: LatLng, bounds: Bounds): { x: number; y: number } {
  const width = bounds.maxLng - bounds.minLng || 1;
  const height = bounds.maxLat - bounds.minLat || 1;
  return {
    x: (point.lng - bounds.minLng) / width,
    y: 1 - (point.lat - bounds.minLat) / height,
  };
}
