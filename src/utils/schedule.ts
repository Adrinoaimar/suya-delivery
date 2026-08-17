import type { Schedule } from '@/types';

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
  return `${schedule.opens} – ${schedule.closes}`;
}
