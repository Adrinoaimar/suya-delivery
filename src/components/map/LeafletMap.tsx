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
  Maximize2,
  Minus,
  Minimize2,
  MapPin,
  Plus,
  RotateCcw,
  Moon,
  Store,
  Sun,
} from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  fetchDrivingRoute,
  isRoutingConfigured,
  selectNextRouteInstruction,
  type RouteDirection,
  type RouteInstruction,
  type RoutePlan,
} from '@/lib/routePlanner';
import { distanceKm } from '@/utils/geo';
import { MAX_TRACK_POINTS } from '@/utils/locationTrail';
import { readLocal, writeLocal, STORAGE_KEYS } from '@/lib/storage';
import { supabase } from '@/lib/supabase/client';
import type { LatLng } from '@/types';
import type { MapViewProps } from './types';

const EMPTY_TRAIL: LatLng[] = [];
type MapTheme = 'day' | 'night';

function storedMapTheme(): MapTheme {
  const value = readLocal<string>(STORAGE_KEYS.riderMapTheme, 'day');
  return value === 'night' ? 'night' : 'day';
}

/**
 * Proveedor de mapa real sobre OpenStreetMap (Leaflet), con la misma lectura que un
 * mapa de ubicaciones: calles, puntos confirmados, ruta vial y repartidor. Si el motor
 * vial no responde, conserva los puntos sin inventar una ruta.
 */
export default function LeafletMap({
  points,
  origin,
  destination,
  rider,
  riderTrail: historicalTrail = EMPTY_TRAIL,
  className,
  label,
  interactive = true,
  navigation = false,
  navigationTarget,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const riderTrailRef = useRef<[number, number][]>([]);
  const riderTrailLineRef = useRef<L.Polyline | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const routeBoundsRef = useRef<L.LatLngBounds | null>(null);
  const routeControllerRef = useRef<AbortController | null>(null);
  const routeRequestIdRef = useRef(0);
  const hasAppliedInitialViewRef = useRef(false);
  const lastRouteRequestRef = useRef<{
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  } | null>(null);
  const hasFittedRouteRef = useRef(false);
  const navigationInstructionIndexRef = useRef(0);
  const previousNavigationPositionRef = useRef<LatLng | null>(null);
  const [tileError, setTileError] = useState(false);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [routeStatus, setRouteStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error' | 'unavailable'
  >('idle');
  const [nextInstruction, setNextInstruction] = useState<RouteInstruction | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapTheme, setMapTheme] = useState<MapTheme>(storedMapTheme);
  const [routeAuthorization, setRouteAuthorization] = useState<string | null>(null);
  const riderLat = rider?.lat;
  const riderLng = rider?.lng;
  const originLat = origin?.lat;
  const originLng = origin?.lng;
  const originLabel = origin?.label;
  const destinationLat = destination?.lat;
  const destinationLng = destination?.lng;
  const destinationLabel = destination?.label;
  const navigationTargetLat = navigationTarget?.lat;
  const navigationTargetLng = navigationTarget?.lng;
  const routingRiderLat = navigation ? riderLat : undefined;
  const routingRiderLng = navigation ? riderLng : undefined;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      // Los controles nativos cuadrados chocan con la tarjeta de guía en móvil.
      // La interfaz renderiza botones redondeados accesibles más abajo.
      zoomControl: false,
      dragging: interactive,
      scrollWheelZoom: false,
      // La atribución se renderiza en una superficie propia para reservar espacio
      // frente a leyendas y errores largos en mapas móviles estrechos.
      attributionControl: false,
    });
    mapRef.current = map;

    const tileUrl =
      import.meta.env.VITE_OSM_TILE_URL?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const tiles = L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    tileLayerRef.current = tiles;
    tiles.on('tileerror', () => setTileError(true));

    routeLayerRef.current = L.layerGroup().addTo(map);
    map.setView([-4.8941, -80.6899], 14);

    // Al cambiar el tamaño del contenedor (hoja inferior que se expande, rotación del
    // teléfono) Leaflet debe recalcular o quedan franjas grises sin tiles.
    const handleResize = () => map.invalidateSize();
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(handleResize) : null;
    if (observer) {
      observer.observe(containerRef.current);
    } else {
      // WebView antiguos pueden no exponer ResizeObserver; el mapa sigue siendo usable
      // y se recalcula al rotar o cambiar el tamaño de la ventana.
      window.addEventListener('resize', handleResize);
    }

    return () => {
      routeControllerRef.current?.abort();
      routeControllerRef.current = null;
      routeRequestIdRef.current += 1;
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', handleResize);
      map.remove();
      mapRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      riderMarkerRef.current = null;
      tileLayerRef.current = null;
      riderTrailRef.current = [];
      riderTrailLineRef.current = null;
      routeLayerRef.current = null;
      routeBoundsRef.current = null;
      hasAppliedInitialViewRef.current = false;
      hasFittedRouteRef.current = false;
      navigationInstructionIndexRef.current = 0;
      previousNavigationPositionRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    if (!navigation) return undefined;
    let cancelled = false;
    void supabase?.auth.getSession().then(({ data }) => {
      if (!cancelled) setRouteAuthorization(data.session?.access_token ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  useEffect(() => {
    const tiles = tileLayerRef.current;
    if (!tiles) return;
    const tileUrl =
      mapTheme === 'night'
        ? import.meta.env.VITE_OSM_DARK_TILE_URL?.trim() ||
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : import.meta.env.VITE_OSM_TILE_URL?.trim() ||
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    tiles.setUrl(tileUrl);
  }, [mapTheme]);

  // Ajusta vista una sola vez. No depende de cada lectura GPS: así el mapa no se
  // reconstruye ni pierde tiles, zoom o rastro mientras cambia la posición.
  useEffect(() => {
    navigationInstructionIndexRef.current = 0;
    previousNavigationPositionRef.current = null;
  }, [routePlan]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasAppliedInitialViewRef.current || points.length === 0) return;

    const latlngs = points.map((point) => [point.lat, point.lng] as [number, number]);
    routeBoundsRef.current = L.latLngBounds(latlngs);
    if (latlngs.length > 1) map.fitBounds(routeBoundsRef.current.pad(0.25), { animate: false });
    else map.setView(latlngs[0], 15);
    hasAppliedInitialViewRef.current = true;
  }, [points]);

  // Si el cliente abre el seguimiento a mitad del viaje, dibuja las posiciones
  // autorizadas que ya existían antes de montar este mapa.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextTrail = historicalTrail.slice(-MAX_TRACK_POINTS);
    const nextPoints = nextTrail.map((position) => [position.lat, position.lng] as [number, number]);
    const unchanged =
      nextPoints.length === riderTrailRef.current.length &&
      nextPoints.every(
        (point, index) => point[0] === riderTrailRef.current[index]?.[0] && point[1] === riderTrailRef.current[index]?.[1],
      );
    if (unchanged) return;
    riderTrailRef.current = nextPoints;
    if (riderTrailRef.current.length === 0) {
      riderTrailLineRef.current?.remove();
      riderTrailLineRef.current = null;
      return;
    }
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
  }, [historicalTrail]);

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

  // El mapa muestra calles reales solo cuando el motor vial autorizado devuelve una ruta válida.
  // Si no está disponible, conserva los puntos y el estado sin inventar una línea recta.
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return undefined;

    // Una vista de cliente o de backoffice puede reutilizar el mismo componente.
    // Al salir de navegación se deben retirar inmediatamente la ruta vial y su estado;
    // de lo contrario una ruta pendiente podría reaparecer sobre un mapa que no guía al rider.
    if (!navigation) {
      routeControllerRef.current?.abort();
      routeControllerRef.current = null;
      routeRequestIdRef.current += 1;
      layer.clearLayers();
      setRoutePlan(null);
      setNextInstruction(null);
      setRouteStatus('idle');
      lastRouteRequestRef.current = null;
      routeBoundsRef.current = null;
      hasFittedRouteRef.current = false;
      return undefined;
    }

    const currentRider =
      routingRiderLat !== undefined && routingRiderLng !== undefined
        ? { lat: routingRiderLat, lng: routingRiderLng }
        : null;
    const currentDestination =
      navigationTargetLat !== undefined && navigationTargetLng !== undefined
        ? { lat: navigationTargetLat, lng: navigationTargetLng }
        : destinationLat !== undefined && destinationLng !== undefined
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

    routeControllerRef.current?.abort();
    const requestId = ++routeRequestIdRef.current;
    layer.clearLayers();
    setRoutePlan(null);
    setNextInstruction(null);
    setRouteStatus('idle');

    if (!routingStart || !routingEnd || distanceKm(routingStart, routingEnd) < 0.01) {
      return undefined;
    }

    if (!isRoutingConfigured()) {
      setRouteStatus('unavailable');
      return undefined;
    }

    lastRouteRequestRef.current = { start: routingStart, end: routingEnd };
    setRouteStatus('loading');
    const controller = new AbortController();
    routeControllerRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 8_000);
    void fetchDrivingRoute(routingStart, routingEnd, controller.signal, routeAuthorization)
      .then((plan) => {
        if (controller.signal.aborted || requestId !== routeRequestIdRef.current) return;
        setRoutePlan(plan);
        setNextInstruction(plan.instructions[0] ?? null);
        setRouteStatus('ready');
      })
      .catch((cause: unknown) => {
        if (requestId !== routeRequestIdRef.current) return;
        if (controller.signal.aborted && !timedOut) return;
        setRouteStatus('error');
        // The direct reference remains on screen; it is intentionally not styled as a road.
        if (cause instanceof Error && cause.name !== 'AbortError')
          console.warn('No se pudo calcular la ruta vial:', cause.message);
      })
      .finally(() => {
        if (requestId !== routeRequestIdRef.current) return;
        window.clearTimeout(timeoutId);
        routeControllerRef.current = null;
      });

    // No cancelar aquí: una lectura GPS menor al umbral vuelve a ejecutar este efecto,
    // pero la misma ruta pendiente debe poder terminar. El controlador solo se cancela
    // cuando comienza otra ruta o al desmontar el mapa.
    return undefined;
  }, [
    destinationLat,
    destinationLng,
    navigation,
    navigationTargetLat,
    navigationTargetLng,
    points,
    routeAuthorization,
    routingRiderLat,
    routingRiderLng,
  ]);

  // Redibuja solo las capas de ruta, no el mapa completo ni sus marcadores.
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const plan = routePlan;
    if (!plan) return;

    plan.alternatives.forEach((alternative) => {
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
    L.polyline(toLatLngs(plan.geometry), {
      color: '#FFFFFF',
      weight: 11,
      opacity: 0.92,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(layer);
    L.polyline(toLatLngs(plan.geometry), {
      color: '#0E6B44',
      weight: 6,
      opacity: 0.98,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(layer);
    routeBoundsRef.current = L.latLngBounds(toLatLngs(plan.geometry));
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
    const selected = selectNextRouteInstruction(
      routePlan.instructions,
      currentRider,
      previousNavigationPositionRef.current,
      navigationInstructionIndexRef.current,
    );
    navigationInstructionIndexRef.current = selected.index;
    previousNavigationPositionRef.current = currentRider;
    setNextInstruction(selected.instruction);
  }, [navigation, riderLat, riderLng, routePlan]);

  // El marcador del repartidor se mueve y deja un rastro visible, sin recentrar de golpe.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!rider) {
      riderMarkerRef.current?.remove();
      riderMarkerRef.current = null;
      // Si la última lectura falla, conserva el rastro histórico que ya cargó el
      // seguimiento. Solo se limpia cuando la fuente también confirma que no hay historial.
      if (historicalTrail.length === 0) {
        riderTrailLineRef.current?.remove();
        riderTrailLineRef.current = null;
        riderTrailRef.current = [];
      }
      return;
    }

    const position: [number, number] = [rider.lat, rider.lng];
    const lastPosition = riderTrailRef.current.at(-1);
    if (
      !lastPosition ||
      distanceKm({ lat: lastPosition[0], lng: lastPosition[1] }, rider) >= 0.004
    ) {
      riderTrailRef.current = [...riderTrailRef.current, position].slice(-MAX_TRACK_POINTS);
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
  }, [historicalTrail, rider]);

  useEffect(() => {
    if (!mapExpanded) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => mapRef.current?.invalidateSize());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMapExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mapExpanded]);

  function recenterRoute() {
    const map = mapRef.current;
    const bounds = routeBoundsRef.current;
    if (map && bounds?.isValid()) map.fitBounds(bounds.pad(0.25), { animate: true, duration: 0.5 });
  }

  return (
    <div
      className={cn(
        'isolate h-full w-full',
        mapTheme === 'night' && 'suya-map-theme-night',
        !mapExpanded && 'relative',
        mapExpanded && 'fixed inset-0 z-[60] bg-suya-carbon',
        className,
      )}
    >
      <div
        ref={containerRef}
        role="img"
        aria-label={label ?? 'Mapa de la ruta en Sullana'}
        className="h-full w-full"
      />
      {interactive && (
        <div className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[500] flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {points.length > 1 && (
              <button
                type="button"
                onClick={recenterRoute}
                className="press flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#0E6B44] shadow-card ring-1 ring-black/10 transition hover:bg-suya-ivory focus:outline-none focus:ring-2 focus:ring-[#0E6B44]"
                aria-label="Centrar mapa en la ruta"
                title="Centrar mapa en la ruta"
              >
                <LocateFixed className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMapExpanded((value) => !value)}
              className="press flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#0E6B44] shadow-card ring-1 ring-black/10 transition hover:bg-suya-ivory focus:outline-none focus:ring-2 focus:ring-[#0E6B44]"
              aria-label={mapExpanded ? 'Salir del mapa completo' : 'Ver mapa completo'}
              aria-pressed={mapExpanded}
              title={mapExpanded ? 'Salir del mapa completo' : 'Ver mapa completo'}
            >
              {mapExpanded ? (
                <Minimize2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
            {navigation && (
              <button
                type="button"
                onClick={() => {
                  const next = mapTheme === 'night' ? 'day' : 'night';
                  setMapTheme(next);
                  writeLocal(STORAGE_KEYS.riderMapTheme, next);
                }}
                className={cn(
                  'press flex h-11 w-11 items-center justify-center rounded-full shadow-card ring-1 ring-black/10 transition focus:outline-none focus:ring-2 focus:ring-[#0E6B44]',
                  mapTheme === 'night'
                    ? 'bg-suya-carbon text-suya-lime hover:bg-black'
                    : 'bg-white/95 text-[#0E6B44] hover:bg-suya-ivory',
                )}
                aria-label={mapTheme === 'night' ? 'Activar modo día' : 'Activar modo noche'}
                title={mapTheme === 'night' ? 'Activar modo día' : 'Activar modo noche'}
              >
                {mapTheme === 'night' ? (
                  <Sun className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Moon className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
          <div
            className={cn(
              'flex flex-col gap-1 rounded-full p-1 shadow-card ring-1 ring-black/10',
              mapTheme === 'night' ? 'bg-suya-carbon/95' : 'bg-white/95',
            )}
          >
            <button
              type="button"
              onClick={() => mapRef.current?.zoomIn()}
              className={cn(
                'press flex h-11 w-11 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-[#0E6B44]',
                mapTheme === 'night' ? 'text-suya-lime hover:bg-black' : 'text-[#0E6B44] hover:bg-suya-ivory',
              )}
              aria-label="Acercar mapa"
              title="Acercar mapa"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomOut()}
              className={cn(
                'press flex h-11 w-11 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-[#0E6B44]',
                mapTheme === 'night' ? 'text-suya-lime hover:bg-black' : 'text-[#0E6B44] hover:bg-suya-ivory',
              )}
              aria-label="Alejar mapa"
              title="Alejar mapa"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {navigation && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'absolute left-3 right-[7.25rem] top-[calc(0.75rem+env(safe-area-inset-top))] z-[500] max-w-[21rem] rounded-2xl px-3.5 py-3 shadow-card ring-1 ring-black/10 backdrop-blur-sm',
            mapTheme === 'night' ? 'bg-suya-carbon/95 text-white' : 'bg-white/95',
          )}
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
                <strong
                  className={cn(
                    'block text-sm leading-tight',
                    mapTheme === 'night' ? 'text-white' : 'text-suya-carbon',
                  )}
                >
                  {nextInstruction.text}
                </strong>
                <span className={cn('mt-1 block text-xs font-medium', mapTheme === 'night' ? 'text-white/70' : 'text-suya-muted')}>
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
            <p className="text-sm font-semibold">Calculando ruta vial…</p>
          ) : routeStatus === 'error' || routeStatus === 'unavailable' ? (
            <p className="text-sm font-semibold">
              Ruta vial no disponible. Revisa conexión e inténtalo nuevamente.
            </p>
          ) : (
            <p className={cn('text-sm font-semibold', mapTheme === 'night' ? 'text-white' : 'text-suya-carbon')}>
              Esperando una posición GPS…
            </p>
          )}
          <p className={cn('mt-2 text-[10px] font-medium', mapTheme === 'night' ? 'text-white/60' : 'text-suya-muted')}>
            {isRoutingConfigured() ? 'Ruta vial · endpoint autorizado' : 'Ruta vial sin configurar'}
          </p>
        </div>
      )}
      {(rider || (routePlan && routePlan.alternatives.length > 0) || tileError) && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex max-w-[52%] flex-col items-start gap-1.5">
          {rider && (
            <div
              className={cn(
                'flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold shadow-card ring-1 ring-black/10',
                mapTheme === 'night' ? 'bg-suya-carbon/95 text-suya-lime' : 'bg-white/95 text-[#0E6B44]',
              )}
            >
              <span className="h-2 w-5 shrink-0 rounded-full bg-suya-lime" aria-hidden="true" />
              <span className="truncate">Recorrido real</span>
            </div>
          )}
          {routePlan && routePlan.alternatives.length > 0 && (
            <div
              className={cn(
                'flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold shadow-card ring-1 ring-black/10',
                mapTheme === 'night' ? 'bg-suya-carbon/95 text-white/70' : 'bg-white/95 text-suya-muted',
              )}
            >
              <span
                className="h-0 w-5 shrink-0 border-t-2 border-dashed border-suya-green/45"
                aria-hidden="true"
              />
              <span className="truncate">Ruta alternativa</span>
            </div>
          )}
          {tileError && (
            <div
              role="status"
              className={cn(
                'max-w-full rounded-xl px-3 py-2 text-xs leading-tight shadow-md ring-1 ring-black/10',
                mapTheme === 'night' ? 'bg-suya-carbon/95 text-white/75' : 'bg-white/95 text-[#6B7076]',
              )}
            >
              No se pudieron cargar algunas calles. La ruta y las direcciones siguen disponibles.
            </div>
          )}
        </div>
      )}
      <div
        className={cn(
          'absolute bottom-1 right-1 z-[500] max-w-[43%] rounded px-1.5 py-1 text-right text-[10px] leading-tight shadow-sm ring-1 ring-black/5',
          mapTheme === 'night' ? 'bg-suya-carbon/90 text-white/65' : 'bg-white/90 text-suya-muted',
        )}
      >
        <span aria-hidden="true">©</span>{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-suya-green/40 underline-offset-2"
        >
          OpenStreetMap
        </a>{' '}
        contributors
        {mapTheme === 'night' && (
          <>
            {' · '}
            <a
              href="https://carto.com/attributions"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-suya-green/40 underline-offset-2"
            >
              CARTO
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function toLatLngs(points: { lat: number; lng: number }[]): [number, number][] {
  return points.map((point) => [point.lat, point.lng]);
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
