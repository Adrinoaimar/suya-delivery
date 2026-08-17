import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/cn';
import type { MapViewProps } from './types';

/**
 * Proveedor Leaflet + OpenStreetMap.
 * Requiere conexión a internet para descargar los tiles; por eso no es el proveedor por defecto.
 * Se carga de forma diferida desde `MapProvider`.
 */
export default function LeafletMap({
  points,
  origin,
  destination,
  rider,
  className,
  label,
  interactive = true,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    const latlngs = points.map((point) => [point.lat, point.lng] as [number, number]);
    if (latlngs.length > 0) {
      L.polyline(latlngs, { color: '#0E6B44', weight: 6, opacity: 0.95 }).addTo(map);
      L.polyline(latlngs, { color: '#FFC107', weight: 2, dashArray: '6 8' }).addTo(map);
      map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
    } else {
      map.setView([-4.8941, -80.6899], 14);
    }

    if (origin) {
      L.circleMarker([origin.lat, origin.lng], {
        radius: 7,
        color: '#0E6B44',
        fillColor: '#FFFFFF',
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(map)
        .bindTooltip(origin.label ?? 'Negocio');
    }

    if (destination) {
      L.circleMarker([destination.lat, destination.lng], {
        radius: 8,
        color: '#0E6B44',
        fillColor: '#FFC107',
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(map)
        .bindTooltip(destination.label ?? 'Destino');
    }

    return () => {
      map.remove();
      mapRef.current = null;
      riderMarkerRef.current = null;
    };
  }, [points, origin, destination, interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rider) return;
    if (!riderMarkerRef.current) {
      riderMarkerRef.current = L.circleMarker([rider.lat, rider.lng], {
        radius: 9,
        color: '#0E6B44',
        fillColor: '#8CC63F',
        fillOpacity: 1,
        weight: 3,
      }).addTo(map);
    } else {
      riderMarkerRef.current.setLatLng([rider.lat, rider.lng]);
    }
  }, [rider]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label ?? 'Mapa de la ruta en Sullana'}
      className={cn('h-full w-full', className)}
    />
  );
}
