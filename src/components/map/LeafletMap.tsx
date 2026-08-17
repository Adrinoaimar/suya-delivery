import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/cn';
import type { MapViewProps } from './types';

/**
 * Proveedor de mapa real sobre OpenStreetMap (Leaflet), con la misma lectura que un
 * mapa de navegación: calles, ruta trazada y el repartidor moviéndose sobre ella.
 * Necesita conexión para descargar los tiles; `MapProvider` cae a `MockMap` si no hay red.
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
  const riderMarkerRef = useRef<L.Marker | null>(null);

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
      // Trazo doble: base verde Suya + línea amarilla punteada, como la ruta de la marca.
      L.polyline(latlngs, { color: '#0E6B44', weight: 7, opacity: 0.95, lineCap: 'round' }).addTo(map);
      L.polyline(latlngs, { color: '#FFC107', weight: 2.5, dashArray: '8 10' }).addTo(map);
      map.fitBounds(L.latLngBounds(latlngs).pad(0.25));
    } else {
      map.setView([-4.8941, -80.6899], 14);
    }

    if (origin) {
      L.marker([origin.lat, origin.lng], { icon: originIcon(), keyboard: false })
        .addTo(map)
        .bindTooltip(origin.label ?? 'Negocio', { direction: 'top' });
    }

    if (destination) {
      L.marker([destination.lat, destination.lng], { icon: destinationIcon(), keyboard: false })
        .addTo(map)
        .bindTooltip(destination.label ?? 'Tu dirección', { direction: 'top' });
    }

    // Al cambiar el tamaño del contenedor (hoja inferior que se expande, rotación del
    // teléfono) Leaflet debe recalcular o quedan franjas grises sin tiles.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      riderMarkerRef.current = null;
    };
  }, [points, origin, destination, interactive]);

  // El marcador del repartidor se mueve y el mapa lo sigue, sin recentrar de golpe.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rider) return;

    const position: [number, number] = [rider.lat, rider.lng];
    if (!riderMarkerRef.current) {
      riderMarkerRef.current = L.marker(position, { icon: riderIcon(), zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip('Tu repartidor', { direction: 'top' });
    } else {
      riderMarkerRef.current.setLatLng(position);
    }

    if (!map.getBounds().pad(-0.25).contains(position)) {
      map.panTo(position, { animate: true, duration: 0.8 });
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

function divIcon(html: string, size: number): L.DivIcon {
  return L.divIcon({
    html,
    className: 'suya-map-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function originIcon(): L.DivIcon {
  return divIcon(
    `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#FFFFFF" stroke="#0E6B44" stroke-width="4"/>
      <circle cx="16" cy="16" r="5" fill="#0E6B44"/>
    </svg>`,
    32,
  );
}

function destinationIcon(): L.DivIcon {
  return divIcon(
    `<svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true">
      <path d="M17 2c-7.7 0-14 6.3-14 14 0 10 14 26 14 26s14-16 14-26c0-7.7-6.3-14-14-14z"
        fill="#0E6B44"/>
      <circle cx="17" cy="16" r="6" fill="#FFC107"/>
    </svg>`,
    44,
  );
}

function riderIcon(): L.DivIcon {
  return divIcon(
    `<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
      <circle cx="22" cy="22" r="20" fill="#8CC63F" opacity="0.32"/>
      <circle cx="22" cy="22" r="13" fill="#FFFFFF" stroke="#0E6B44" stroke-width="3"/>
      <g transform="translate(11 13) scale(0.16)" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M34 100 L68 80 L102 80 L126 100" stroke="#0E6B44" stroke-width="26"/>
        <circle cx="34" cy="100" r="18" stroke="#1F2023" stroke-width="20"/>
        <circle cx="126" cy="100" r="18" stroke="#1F2023" stroke-width="20"/>
        <path d="M78 74 L94 48" stroke="#0E6B44" stroke-width="30"/>
        <circle cx="103" cy="38" r="14" fill="#0A5335" stroke="none"/>
      </g>
    </svg>`,
    44,
  );
}
