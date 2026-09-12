import type { Schedule, Store } from '@/types';

function toMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Indica si el negocio está abierto ahora, contemplando horarios que cruzan medianoche. */
export function isOpenNow(schedule: Schedule, now: Date = new Date()): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  const opens = toMinutes(schedule.opens);
  const closes = toMinutes(schedule.closes);
  if (opens === closes) return false;
  if (opens < closes) return current >= opens && current < closes;
  return current >= opens || current < closes;
}

export function scheduleLabel(schedule: Schedule): string {
  if (schedule.opens === schedule.closes) return 'Horario por confirmar';
  return `${schedule.opens} – ${schedule.closes}`;
}

/** Catálogo visible sin datos suficientes para aceptar pedidos ni mostrar métricas operativas. */
export function isInformationalStore(store: Store): boolean {
  return store.isComingSoon === true || (store.acceptingOrders === false && store.schedule.opens === store.schedule.closes);
}

/** Prioriza el control operativo del backend y mantiene compatibilidad con datos locales. */
export function isStoreAcceptingOrders(store: Store, now: Date = new Date()): boolean {
  if (store.isComingSoon) return false;
  return store.acceptingOrders ?? isOpenNow(store.schedule, now);
}
