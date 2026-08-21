import type { OrderStatus, PaymentMethod } from '@/types';

const soles = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatea un monto en soles: `formatPrice(19.9)` → `S/ 19.90`. */
export function formatPrice(value: number): string {
  return `S/ ${soles.format(value)}`;
}

export function formatEta(min: number, max: number): string {
  return `${min}–${max} min`;
}

export function formatDistance(km: number): string {
  if (km <= 0) return 'Por calcular';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatTime(value: string | number): string {
  return new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/** «hace 4 segundos», «hace 3 min». Para el estado de ubicación compartida. */
export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return 'hace un instante';
  if (seconds < 60) return `hace ${seconds} segundos`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  confirmed: 'Pedido confirmado',
  preparing: 'En preparación',
  picked_up: 'Repartidor recogió pedido',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  card: 'Tarjeta',
};

export function paymentLabel(method: PaymentMethod): string {
  return PAYMENT_LABELS[method];
}

/** Inicial usada en las tarjetas neutras cuando no hay logo oficial. */
export function initialsOf(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
