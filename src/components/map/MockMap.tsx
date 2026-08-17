import { useId, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { boundsOf, projectToUnit } from '@/utils/geo';
import type { LatLng } from '@/types';
import type { MapViewProps } from './types';

const WIDTH = 320;
const HEIGHT = 220;
const PAD = 26;

/**
 * Mapa de demostración dibujado en SVG.
 * No necesita conexión, tiles ni API key: es el proveedor por defecto de la demo local.
 */
export function MockMap({ points, origin, destination, rider, className, label }: MapViewProps) {
  const gridId = useId();

  const { toXY, path } = useMemo(() => {
    const all = [...points];
    if (origin) all.push(origin);
    if (destination) all.push(destination);
    const bounds = boundsOf(all.length > 0 ? all : [{ lat: 0, lng: 0 }]);

    const project = (point: LatLng) => {
      const unit = projectToUnit(point, bounds);
      return {
        x: PAD + unit.x * (WIDTH - PAD * 2),
        y: PAD + unit.y * (HEIGHT - PAD * 2),
      };
    };

    const d = points
      .map((point, index) => {
        const { x, y } = project(point);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

    return { toXY: project, path: d };
  }, [points, origin, destination]);

  const originXY = origin ? toXY(origin) : null;
  const destinationXY = destination ? toXY(destination) : null;
  const riderXY = rider ? toXY(rider) : null;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label ?? 'Mapa de la ruta en Sullana'}
      className={cn('h-full w-full', className)}
    >
      <defs>
        <pattern id={gridId} width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0 H0 V26" fill="none" stroke="#E6E7E9" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width={WIDTH} height={HEIGHT} fill="#F4F1EA" />
      <rect width={WIDTH} height={HEIGHT} fill={`url(#${gridId})`} />

      {/* Manzanas y avenidas de referencia */}
      <g fill="#EDE9E1">
        <rect x="12" y="16" width="72" height="46" rx="4" />
        <rect x="104" y="24" width="58" height="38" rx="4" />
        <rect x="188" y="12" width="86" height="52" rx="4" />
        <rect x="24" y="146" width="66" height="48" rx="4" />
        <rect x="196" y="150" width="92" height="44" rx="4" />
      </g>
      <g stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round">
        <path d="M0 92 H320" />
        <path d="M0 132 H320" />
        <path d="M96 0 V220" />
        <path d="M232 0 V220" />
      </g>

      {/* Río Chira, referencia local */}
      <path
        d="M-4 34 C 60 52, 96 20, 150 40 C 210 62, 250 30, 324 48"
        fill="none"
        stroke="#CFE3DA"
        strokeWidth="9"
        strokeLinecap="round"
      />

      {/* Ruta del pedido */}
      <path
        d={path}
        fill="none"
        stroke="#0E6B44"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <path
        d={path}
        fill="none"
        stroke="#FFC107"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="7 9"
      />

      {originXY && (
        <g transform={`translate(${originXY.x} ${originXY.y})`}>
          <circle r="9" fill="#FFFFFF" stroke="#0E6B44" strokeWidth="3" />
          <circle r="3.5" fill="#0E6B44" />
        </g>
      )}

      {destinationXY && (
        <g transform={`translate(${destinationXY.x} ${destinationXY.y - 20})`}>
          <path
            d="M0 0 c-8 0 -14 6 -14 14 0 10 14 22 14 22 s14 -12 14 -22 c0 -8 -6 -14 -14 -14 z"
            fill="#0E6B44"
          />
          <circle cx="0" cy="14" r="5" fill="#FFC107" />
        </g>
      )}

      {riderXY && (
        <g transform={`translate(${riderXY.x} ${riderXY.y})`}>
          <circle r="14" fill="#8CC63F" opacity="0.28" />
          <circle r="9.5" fill="#FFFFFF" stroke="#0E6B44" strokeWidth="2" />
          <circle r="4.5" fill="#FFC107" />
        </g>
      )}
    </svg>
  );
}
