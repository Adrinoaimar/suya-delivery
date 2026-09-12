/**
 * Restaurantes que ya tienen perfil comercial publicado en Supabase.
 * El catálogo puede mostrar más fichas para anunciar próximas aperturas, pero solo estos
 * negocios aceptan pedidos en esta fase.
 */
export const LIVE_RESTAURANT_IDS = ['anda-paya', 'anda-paya-cevicheria', 'donde-joel'] as const;

export function isLiveRestaurantId(id: string): boolean {
  return (LIVE_RESTAURANT_IDS as readonly string[]).includes(id);
}
