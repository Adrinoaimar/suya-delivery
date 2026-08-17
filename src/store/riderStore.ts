import { create } from 'zustand';
import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/storage';
import { createId, createShareToken } from '@/utils/id';
import type { Incident, IncidentCategory, LatLng, SosEvent, TrustedContact } from '@/types';

export interface RiderSafetyState {
  available: boolean;
  trustedContact: TrustedContact | null;
  shareToken: string | null;
  simulatedLocation: boolean;
  incidents: Incident[];
  sosEvents: SosEvent[];
}

const DEFAULT_STATE: RiderSafetyState = {
  available: false,
  trustedContact: null,
  shareToken: null,
  simulatedLocation: true,
  incidents: [],
  sosEvents: [],
};

interface RiderState extends RiderSafetyState {
  setAvailable: (value: boolean) => void;
  setTrustedContact: (contact: TrustedContact | null) => void;
  setSimulatedLocation: (value: boolean) => void;
  ensureShareToken: () => string;
  regenerateShareToken: () => string;
  addIncident: (input: {
    category: IncidentCategory;
    description: string;
    position: LatLng | null;
  }) => Incident;
  triggerSos: (position: LatLng | null) => SosEvent;
  resolveSos: (id: string) => void;
}

function persist(state: RiderSafetyState): void {
  writeLocal(STORAGE_KEYS.rider, {
    available: state.available,
    simulatedLocation: state.simulatedLocation,
    shareToken: state.shareToken,
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
    simulatedLocation: DEFAULT_STATE.simulatedLocation,
    shareToken: DEFAULT_STATE.shareToken,
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

  setSimulatedLocation(value) {
    const next = { ...get(), simulatedLocation: value };
    persist(next);
    set({ simulatedLocation: value });
  },

  ensureShareToken() {
    const existing = get().shareToken;
    if (existing) return existing;
    const token = createShareToken();
    const next = { ...get(), shareToken: token };
    persist(next);
    set({ shareToken: token });
    return token;
  },

  regenerateShareToken() {
    const token = createShareToken();
    const next = { ...get(), shareToken: token };
    persist(next);
    set({ shareToken: token });
    return token;
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

  triggerSos(position) {
    const event: SosEvent = {
      id: createId('sos'),
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
