import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bike,
  CornerUpLeft,
  CornerUpRight,
  LocateFixed,
  MapPin,
  RotateCcw,
  Store,
} from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  fetchDrivingRoute,
  type RouteDirection,
  type RouteInstruction,
  type RoutePlan,
} from '@/lib/routePlanner';
import { distanceKm } from '@/utils/geo';
import type { MapViewProps } from './types';

/**
 * Proveedor de mapa real sobre OpenStreetMap (Leaflet), con la misma lectura que un
 * mapa de ubicaciones: calles, puntos confirmados, ruta vial y repartidor. Si el motor
 * vial no responde, conserva un trazo de referencia claramente diferenciado.
 */
export default function LeafletMap({
  points,
  origin,
  destination,
  rider,
  className,
  label,
  interactive = true,
  navigation = false,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const riderTrailRef = useRef<[number, number][]>([]);
  const riderTrailLineRef = useRef<L.Polyline | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const routeBoundsRef = useRef<L.LatLngBounds | null>(null);
  const hasAppliedInitialViewRef = useRef(false);
  const lastRouteRequestRef = useRef<{
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  } | null>(null);
  const hasFittedRouteRef = useRef(false);
  const [tileError, setTileError] = useState(false);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [routeStatus, setRouteStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [nextInstruction, setNextInstruction] = useState<RouteInstruction | null>(null);
  const riderLat = rider?.lat;
  const riderLng = rider?.lng;
  const originLat = origin?.lat;
  const originLng = origin?.lng;
  const originLabel = origin?.label;
  const destinationLat = destination?.lat;
  const destinationLng = destination?.lng;
  const destinationLabel = destination?.label;
  const routingRiderLat = navigation ? riderLat : undefined;
  const routingRiderLng = navigation ? riderLng : undefined;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    mapRef.current = map;

    const tileUrl =
      import.meta.env.VITE_OSM_TILE_URL?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const tiles = L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    tiles.on('tileerror', () => setTileError(true));

    routeLayerRef.current = L.layerGroup().addTo(map);
    map.setView([-4.8941, -80.6899], 14);

    // Al cambiar el tamaño del contenedor (hoja inferior que se expande, rotación del
    // teléfono) Leaflet debe recalcular o quedan franjas grises sin tiles.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      riderMarkerRef.current = null;
      riderTrailRef.current = [];
      riderTrailLineRef.current = null;
      routeLayerRef.current = null;
      routeBoundsRef.current = null;
      hasAppliedInitialViewRef.current = false;
      hasFittedRouteRef.current = false;
    };
  }, [interactive]);

  // Ajusta vista una sola vez. No depende de cada lectura GPS: así el mapa no se
  // reconstruye ni pierde tiles, zoom o rastro mientras cambia la posición.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasAppliedInitialViewRef.current || points.length === 0) return;

    const latlngs = points.map((point) => [point.lat, point.lng] as [number, number]);
    routeBoundsRef.current = L.latLngBounds(latlngs);
    if (latlngs.length > 1) map.fitBounds(routeBoundsRef.current.pad(0.25), { animate: false });
    else map.setView(latlngs[0], 15);
    hasAppliedInitialViewRef.current = true;
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    originMarkerRef.current?.remove();
    originMarkerRef.current = null;
    if (originLat !== undefined && originLng !== undefined) {
      const markerLabel = originLabel ?? 'Negocio';
      originMarkerRef.current = L.marker([originLat, originLng], {
        icon: originIcon(),
        keyboard: true,
        title: markerLabel,
      })
        .addTo(map)
        .bindTooltip(markerLabel, { direction: 'top' })
        .bindPopup(`<strong>${escapeHtml(markerLabel)}</strong>`);
    }

    destinationMarkerRef.current?.remove();
    destinationMarkerRef.current = null;
    if (destinationLat !== undefined && destinationLng !== undefined) {
      const markerLabel = destinationLabel ?? 'Tu dirección';
      destinationMarkerRef.current = L.marker([destinationLat, destinationLng], {
        icon: destinationIcon(),
        keyboard: true,
        title: markerLabel,
      })
        .addTo(map)
        .bindTooltip(markerLabel, { direction: 'top' })
        .bindPopup(`<strong>${escapeHtml(markerLabel)}</strong>`);
    }
  }, [destinationLabel, destinationLat, destinationLng, originLabel, originLat, originLng]);

  // El mapa muestra calles reales cuando es posible. En Rider se recalcula cada 50 m
  // para que el camino siga al GPS sin generar una petición por cada lectura.
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return undefined;

    const currentRider =
      routingRiderLat !== undefined && routingRiderLng !== undefined
        ? { lat: routingRiderLat, lng: routingRiderLng }
        : null;
    const currentDestination =
      destinationLat !== undefined && destinationLng !== undefined
        ? { lat: destinationLat, lng: destinationLng }
        : null;
    const routingStart = navigation && currentRider ? currentRider : points[0];
    const routingEnd = currentDestination ?? points.at(-1);
    const previous = lastRouteRequestRef.current;
    const minimumMovementKm = navigation ? 0.05 : 0;
    const canReuseRoute = Boolean(
      previous &&
      distanceKm(previous.start, routingStart ?? previous.start) < minimumMovementKm &&
      routingEnd &&
      distanceKm(previous.end, routingEnd) < 0.01 &&
      layer.getLayers().length > 0,
    );
    if (canReuseRoute) return undefined;

    layer.clearLayers();
    setRoutePlan(null);
    setNextInstruction(null);
    setRouteStatus('idle');

    const fallbackPoints =
      navigation && currentRider && routingEnd ? [currentRider, routingEnd] : points;
    if (fallbackPoints.length > 1) {
      drawFallbackRoute(layer, fallbackPoints);
      routeBoundsRef.current = L.latLngBounds(
        fallbackPoints.map((point) => [point.lat, point.lng] as [number, number]),
      );
    }

    if (!routingStart || !routingEnd || distanceKm(routingStart, routingEnd) < 0.01) {
      return undefined;
    }

    lastRouteRequestRef.current = { start: routingStart, end: routingEnd };
    setRouteStatus('loading');
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 8_000);
    void fetchDrivingRoute(routingStart, routingEnd, controller.signal)
      .then((plan) => {
        if (controller.signal.aborted) return;
        setRoutePlan(plan);
        setNextInstruction(plan.instructions[0] ?? null);
        setRouteStatus('ready');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted && !timedOut) return;
        setRouteStatus('error');
        // The direct reference remains on screen; it is intentionally not styled as a road.
        if (cause instanceof Error && cause.name !== 'AbortError')
          console.warn('No se pudo calcular la ruta vial:', cause.message);
      })
      .finally(() => window.clearTimeout(timeoutId));

    return () => controller.abort();
  }, [destinationLat, destinationLng, navigation, points, routingRiderLat, routingRiderLng]);

  // Redibuja solo las capas de ruta, no el mapa completo ni sus marcadores.
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const currentRider =
      routingRiderLat !== undefined && routingRiderLng !== undefined
        ? { lat: routingRiderLat, lng: routingRiderLng }
        : null;
    const currentDestination =
      destinationLat !== undefined && destinationLng !== undefined
        ? { lat: destinationLat, lng: destinationLng }
        : null;
    const fallbackPoints =
      navigation && currentRider && currentDestination
        ? [currentRider, currentDestination]
        : points;
    if (!routePlan) {
      if (fallbackPoints.length > 1) drawFallbackRoute(layer, fallbackPoints);
      return;
    }

    routePlan.alternatives.forEach((alternative) => {
      L.polyline(toLatLngs(alternative.geometry), {
        color: '#0E6B44',
        weight: 5,
        opacity: 0.28,
        dashArray: '10 12',
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(layer);
    });
    L.polyline(toLatLngs(routePlan.geometry), {
      color: '#FFFFFF',
      weight: 11,
      opacity: 0.92,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(layer);
    L.polyline(toLatLngs(routePlan.geometry), {
      color: '#0E6B44',
      weight: 6,
      opacity: 0.98,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(layer);
    routeBoundsRef.current = L.latLngBounds(toLatLngs(routePlan.geometry));
    if (!hasFittedRouteRef.current) {
      map.fitBounds(routeBoundsRef.current.pad(0.2), { animate: false });
      hasFittedRouteRef.current = true;
    }
  }, [destinationLat, destinationLng, navigation, points, routingRiderLat, routingRiderLng, routePlan]);

  useEffect(() => {
    if (
      !navigation ||
      riderLat === undefined ||
      riderLng === undefined ||
      !routePlan?.instructions.length
    )
      return;
    const currentRider = { lat: riderLat, lng: riderLng };
    const ahead = routePlan.instructions.filter(
      (instruction) =>
        instruction.direction !== 'depart' &&
        instruction.direction !== 'arrive' &&
        distanceKm(currentRider, instruction.position) >= 0.03,
    );
    const arrival = routePlan.instructions.find(
      (instruction) => instruction.direction === 'arrive',
    );
    const straightAhead = routePlan.instructions.find(
      (instruction) =>
        instruction.direction === 'straight' &&
        distanceKm(currentRider, instruction.position) >= 0.03,
    );
    const fallback: RouteInstruction | null = arrival
      ? {
          text: 'Continúa hacia el destino',
          direction: 'straight',
          distanceMeters: distanceKm(currentRider, arrival.position) * 1000,
          durationSeconds: arrival.durationSeconds,
          position: arrival.position,
        }
      : (routePlan.instructions.at(-1) ?? null);
    setNextInstruction(ahead[0] ?? straightAhead ?? fallback);
  }, [navigation, riderLat, riderLng, routePlan]);

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
    if (
      !lastPosition ||
      distanceKm({ lat: lastPosition[0], lng: lastPosition[1] }, rider) >= 0.004
    ) {
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
      {navigation && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-3 top-3 z-[500] max-w-[min(82%,21rem)] rounded-2xl bg-white/95 px-3.5 py-3 shadow-card ring-1 ring-black/10 backdrop-blur-sm"
        >
          {rider && nextInstruction && routeStatus !== 'error' ? (
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-suya-green text-white">
                {(() => {
                  const Icon = instructionIcon(nextInstruction.direction);
                  return <Icon className="h-6 w-6" aria-hidden="true" />;
                })()}
              </span>
              <span className="min-w-0">
                <strong className="block text-sm leading-tight text-suya-carbon">
                  {nextInstruction.text}
                </strong>
                <span className="mt-1 block text-xs font-medium text-suya-muted">
                  {formatDistance(
                    rider
                      ? distanceKm(rider, nextInstruction.position) * 1000
                      : nextInstruction.distanceMeters,
                  )}
                  {routeStatus === 'loading' ? ' · actualizando ruta…' : ''}
                </span>
              </span>
            </div>
          ) : routeStatus === 'loading' ? (
            <p className="text-sm font-semibold text-suya-carbon">Calculando ruta vial…</p>
          ) : routeStatus === 'error' ? (
            <p className="text-sm font-semibold text-suya-carbon">
              Guía vial no disponible. Sigue el trazo y la dirección de entrega.
            </p>
          ) : (
            <p className="text-sm font-semibold text-suya-carbon">Esperando una posición GPS…</p>
          )}
          <p className="mt-2 text-[10px] font-medium text-suya-muted">
            Ruta vial · OSRM + OpenStreetMap
          </p>
        </div>
      )}
      {rider && (
        <div className="absolute bottom-3 left-3 z-[500] flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-[11px] font-semibold text-[#0E6B44] shadow-card ring-1 ring-black/10">
          <span className="h-2 w-5 rounded-full bg-suya-lime" aria-hidden="true" />
          Recorrido real
        </div>
      )}
      {routePlan && routePlan.alternatives.length > 0 && (
        <div
          className={cn(
            'absolute left-3 z-[500] flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-[11px] font-semibold text-suya-muted shadow-card ring-1 ring-black/10',
            rider ? 'bottom-14' : 'bottom-3',
          )}
        >
          <span
            className="h-0 w-5 border-t-2 border-dashed border-suya-green/45"
            aria-hidden="true"
          />
          Ruta alternativa
        </div>
      )}
      {tileError && (
        <div
          role="status"
          className="absolute inset-x-3 bottom-3 z-[500] rounded-xl bg-white/95 px-3 py-2 text-xs text-[#6B7076] shadow-md ring-1 ring-black/10"
        >
          No se pudieron cargar algunas calles. La ruta y las direcciones siguen disponibles.
        </div>
      )}
    </div>
  );
}

function toLatLngs(points: { lat: number; lng: number }[]): [number, number][] {
  return points.map((point) => [point.lat, point.lng]);
}

function drawFallbackRoute(layer: L.LayerGroup, points: { lat: number; lng: number }[]): void {
  const latlngs = toLatLngs(points);
  L.polyline(latlngs, {
    color: '#FFFFFF',
    weight: 9,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(layer);
  L.polyline(latlngs, {
    color: '#F2B544',
    weight: 4,
    opacity: 0.95,
    dashArray: '9 11',
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(layer);
}

function instructionIcon(direction: RouteDirection): LucideIcon {
  switch (direction) {
    case 'left':
    case 'sharp-left':
      return ArrowLeft;
    case 'slight-left':
      return CornerUpLeft;
    case 'right':
    case 'sharp-right':
      return ArrowRight;
    case 'slight-right':
      return CornerUpRight;
    case 'uturn':
      return RotateCcw;
    case 'arrive':
      return MapPin;
    default:
      return ArrowUp;
  }
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
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
