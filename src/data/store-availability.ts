/**
 * Restaurantes que ya tienen perfil comercial publicado en Supabase.
 * El catálogo local puede mostrar más fichas para diseñar la experiencia, pero no debe
 * presentarlas como disponibles para pedir mientras no estén dentro de este conjunto.
 */
export const LIVE_RESTAURANT_IDS = [
  'anda-paya',
  'donde-joel',
  'la-waka',
  'tio-jhony',
] as const;

export function isLiveRestaurantId(id: string): boolean {
  return (LIVE_RESTAURANT_IDS as readonly string[]).includes(id);
}
