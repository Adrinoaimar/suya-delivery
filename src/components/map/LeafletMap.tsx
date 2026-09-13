import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bike, LocateFixed, MapPin, Store } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { distanceKm } from '@/utils/geo';
import type { MapViewProps } from './types';

/**
 * Proveedor de mapa real sobre OpenStreetMap (Leaflet), con la misma lectura que un
 * mapa de ubicaciones: calles, puntos confirmados y repartidor. La línea entre puntos
 * es referencia visual, no una ruta calculada.
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
  const riderTrailRef = useRef<[number, number][]>([]);
  const riderTrailLineRef = useRef<L.Polyline | null>(null);
  const routeBoundsRef = useRef<L.LatLngBounds | null>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    mapRef.current = map;

    const tileUrl = import.meta.env.VITE_OSM_TILE_URL?.trim() ||
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const tiles = L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    tiles.on('tileerror', () => setTileError(true));

    const latlngs = points.map((point) => [point.lat, point.lng] as [number, number]);
    if (latlngs.length > 0) {
      // Trazo doble: base verde Suya + línea amarilla punteada, como la ruta de la marca.
      L.polyline(latlngs, { color: '#0E6B44', weight: 7, opacity: 0.95, lineCap: 'round' }).addTo(map);
      L.polyline(latlngs, { color: '#FFC107', weight: 2.5, dashArray: '8 10' }).addTo(map);
      routeBoundsRef.current = L.latLngBounds(latlngs);
      map.fitBounds(routeBoundsRef.current.pad(0.25));
    } else {
      map.setView([-4.8941, -80.6899], 14);
    }

    if (origin) {
      L.marker([origin.lat, origin.lng], { icon: originIcon(), keyboard: true, title: origin.label ?? 'Negocio' })
        .addTo(map)
        .bindTooltip(origin.label ?? 'Negocio', { direction: 'top' })
        .bindPopup(`<strong>${escapeHtml(origin.label ?? 'Negocio')}</strong>`);
    }

    if (destination) {
      L.marker([destination.lat, destination.lng], { icon: destinationIcon(), keyboard: true, title: destination.label ?? 'Tu dirección' })
        .addTo(map)
        .bindTooltip(destination.label ?? 'Tu dirección', { direction: 'top' })
        .bindPopup(`<strong>${escapeHtml(destination.label ?? 'Tu dirección')}</strong>`);
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
      riderTrailRef.current = [];
      riderTrailLineRef.current = null;
    };
  }, [points, origin, destination, interactive]);

  // El marcador del repartidor se mueve y deja un rastro visible, sin recentrar de golpe.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!rider) {
      riderMarkerRef.current?.remove();
      riderMarkerRef.current = null;
      riderTrailLineRef.current?.remove();
      riderTrailLineRef.current = null;
      riderTrailRef.current = [];
      return;
    }

    const position: [number, number] = [rider.lat, rider.lng];
    const lastPosition = riderTrailRef.current.at(-1);
    if (!lastPosition || distanceKm({ lat: lastPosition[0], lng: lastPosition[1] }, rider) >= 0.004) {
      riderTrailRef.current = [...riderTrailRef.current, position];
      if (!riderTrailLineRef.current) {
        riderTrailLineRef.current = L.polyline(riderTrailRef.current, {
          color: '#8CC63F',
          weight: 5,
          opacity: 0.96,
          dashArray: '1 10',
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }).addTo(map);
      } else {
        riderTrailLineRef.current.setLatLngs(riderTrailRef.current);
      }
    }

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

  function recenterRoute() {
    const map = mapRef.current;
    const bounds = routeBoundsRef.current;
    if (map && bounds?.isValid()) map.fitBounds(bounds.pad(0.25), { animate: true, duration: 0.5 });
  }

  return (
    <div className={cn('relative h-full w-full', className)}>
      <div
        ref={containerRef}
        role="img"
        aria-label={label ?? 'Mapa de la ruta en Sullana'}
        className="h-full w-full"
      />
      {interactive && points.length > 1 && (
        <button
          type="button"
          onClick={recenterRoute}
          className="press absolute right-3 top-3 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#0E6B44] shadow-card ring-1 ring-black/10 transition hover:bg-suya-ivory focus:outline-none focus:ring-2 focus:ring-[#0E6B44]"
          aria-label="Centrar mapa en la ruta"
          title="Centrar mapa en la ruta"
        >
          <LocateFixed className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      {rider && (
        <div className="absolute bottom-3 left-3 z-[500] flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-[11px] font-semibold text-[#0E6B44] shadow-card ring-1 ring-black/10">
          <span className="h-2 w-5 rounded-full bg-suya-lime" aria-hidden="true" />
          Recorrido real
        </div>
      )}
      {tileError && (
        <div role="status" className="absolute inset-x-3 bottom-3 z-[500] rounded-xl bg-white/95 px-3 py-2 text-xs text-[#6B7076] shadow-md ring-1 ring-black/10">
          No se pudieron cargar algunas calles. La ruta y las direcciones siguen disponibles.
        </div>
      )}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
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
  return markerIcon(Store, 'suya-map-pin--origin', 38, 'Restaurante');
}

function destinationIcon(): L.DivIcon {
  return markerIcon(MapPin, 'suya-map-pin--destination', 42, 'Punto de entrega');
}

function riderIcon(): L.DivIcon {
  return markerIcon(Bike, 'suya-map-pin--rider', 46, 'Repartidor');
}

function markerIcon(Icon: LucideIcon, variant: string, size: number, label: string): L.DivIcon {
  const iconMarkup = renderToStaticMarkup(
    <Icon size={18} strokeWidth={2.4} aria-hidden="true" focusable="false" />,
  );
  return divIcon(
    `<span class="suya-map-pin ${variant}" role="img" aria-label="${escapeHtml(label)}">${iconMarkup}</span>`,
    size,
  );
}
