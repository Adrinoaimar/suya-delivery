/**
 * Zonas operativas de seguridad para Sullana.
 *
 * Orientación operativa basada en fuentes públicas. No representa garantía de
 * seguridad ni reemplaza el mapa del delito georreferenciado del MININTER.
 */
export type SafetyZoneCategory = 'recommended' | 'caution' | 'avoid';

export interface SafetyZone {
  id: string;
  name: string;
  category: SafetyZoneCategory;
  guidance: string;
  /** Centro aproximado para una futura capa cartográfica. */
  center?: { lat: number; lng: number };
  radiusMeters?: number;
  source: string;
  verifiedAt: string;
}

/** Fuentes a completar por coordinación antes de publicar zonas. */
export const SAFETY_ZONES: readonly SafetyZone[] = [
  {
    id: 'loma-teodomiro', name: 'Loma de Teodomiro', category: 'recommended',
    guidance: 'Mejor visibilidad reportada por alumbrado LED. Mantén atención y circula por vías principales.',
    source: 'ENOSA, abril 2025', verifiedAt: '2025-04',
  },
  {
    id: 'mariano-santos', name: 'Mariano Santos', category: 'recommended',
    guidance: 'Mejor visibilidad reportada por alumbrado LED. No equivale a zona segura.',
    source: 'ENOSA, abril 2025', verifiedAt: '2025-04',
  },
  {
    id: 'manuel-seoane-obrero', name: 'Manuel Seoane (El Obrero)', category: 'recommended',
    guidance: 'Mejor visibilidad reportada por alumbrado LED; verifica horario y condiciones reales.',
    source: 'ENOSA, abril 2025', verifiedAt: '2025-04',
  },
  {
    id: 'encuentro-pilares-lancones', name: 'Encuentro de los Pilares (Lancones)', category: 'recommended',
    guidance: 'Mejor visibilidad reportada por alumbrado LED. Coordina antes de desvíos o rutas rurales.',
    source: 'ENOSA, abril 2025', verifiedAt: '2025-04',
  },
  {
    id: 'sullana-alerta-distrital', name: 'Distrito de Sullana — alerta general', category: 'caution',
    guidance: 'Las denuncias oficiales muestran alerta elevada; prioriza horario diurno, vías principales y contacto activo.',
    source: 'INEI, boletín de seguridad I semestre 2025', verifiedAt: '2025-12',
  },
  {
    id: 'sin-dato-geografico', name: 'Sectores sin dato georreferenciado público', category: 'avoid',
    guidance: 'No clasificar como seguros. Confirma la ruta con Operaciones antes de ingresar, especialmente de noche.',
    source: 'MININTER — mapa del delito georreferenciado', verifiedAt: '2025-02',
  },
];

export const SAFETY_ZONE_CATEGORY_LABELS: Record<SafetyZoneCategory, string> = {
  recommended: 'Mejor visibilidad reportada',
  caution: 'Precaución',
  avoid: 'Confirmar antes de ingresar',
};

export const SAFETY_ZONE_CATEGORY_DESCRIPTIONS: Record<SafetyZoneCategory, string> = {
  recommended: 'Alumbrado documentado; no equivale a zona segura.',
  caution: 'Evalúa horario, iluminación y apoyo antes de continuar.',
  avoid: 'No hay evidencia granular suficiente; coordina antes de ingresar.',
};
