import { create } from 'zustand';
import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/storage';
import { createId } from '@/utils/id';
import type { Incident, IncidentCategory, LatLng, SosEvent, TrustedContact } from '@/types';

export interface RiderSafetyState {
  available: boolean;
  trustedContact: TrustedContact | null;
  incidents: Incident[];
  sosEvents: SosEvent[];
}

const DEFAULT_STATE: RiderSafetyState = {
  available: false,
  trustedContact: null,
  incidents: [],
  sosEvents: [],
};

interface RiderState extends RiderSafetyState {
  setAvailable: (value: boolean) => void;
  setTrustedContact: (contact: TrustedContact | null) => void;
  addIncident: (input: {
    category: IncidentCategory;
    description: string;
    position: LatLng | null;
  }) => Incident;
  triggerSos: (position: LatLng | null, id?: string) => SosEvent;
  resolveSos: (id: string) => void;
}

function persist(state: RiderSafetyState): void {
  writeLocal(STORAGE_KEYS.rider, {
    available: state.available,
  });
  writeLocal(STORAGE_KEYS.safety, {
    trustedContact: state.trustedContact,
    incidents: state.incidents,
    sosEvents: state.sosEvents,
  });
}

function load(): RiderSafetyState {
  const rider = readLocal(STORAGE_KEYS.rider, {
    available: DEFAULT_STATE.available,
  });
  const safety = readLocal(STORAGE_KEYS.safety, {
    trustedContact: DEFAULT_STATE.trustedContact,
    incidents: DEFAULT_STATE.incidents,
    sosEvents: DEFAULT_STATE.sosEvents,
  });
  return { ...rider, ...safety };
}

export const useRiderStore = create<RiderState>((set, get) => ({
  ...load(),

  setAvailable(value) {
    const next = { ...get(), available: value };
    persist(next);
    set({ available: value });
  },

  setTrustedContact(contact) {
    const next = { ...get(), trustedContact: contact };
    persist(next);
    set({ trustedContact: contact });
  },

  addIncident(input) {
    const incident: Incident = {
      id: createId('inc'),
      category: input.category,
      description: input.description,
      position: input.position,
      createdAt: new Date().toISOString(),
    };
    const incidents = [incident, ...get().incidents];
    const next = { ...get(), incidents };
    persist(next);
    set({ incidents });
    return incident;
  },

  triggerSos(position, id) {
    const event: SosEvent = {
      id: id ?? createId('sos'),
      createdAt: new Date().toISOString(),
      position,
      resolvedAt: null,
    };
    const sosEvents = [event, ...get().sosEvents];
    const next = { ...get(), sosEvents };
    persist(next);
    set({ sosEvents });
    return event;
  },

  resolveSos(id) {
    const sosEvents = get().sosEvents.map((event) =>
      event.id === id ? { ...event, resolvedAt: new Date().toISOString() } : event,
    );
    const next = { ...get(), sosEvents };
    persist(next);
    set({ sosEvents });
  },
}));

export const INCIDENT_LABELS: Record<IncidentCategory, string> = {
  accidente: 'Accidente',
  mecanico: 'Problema mecánico',
  cliente: 'Cliente conflictivo',
  'zona-insegura': 'Zona insegura',
  robo: 'Robo',
  otro: 'Otro',
};
