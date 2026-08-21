/** Promoción demo aislada. Producción cobra siempre el envío definido por servidor. */
export const FREE_DELIVERY_THRESHOLD =
  import.meta.env.VITE_BACKEND === 'supabase' ? Number.POSITIVE_INFINITY : 20;

export const FREE_DELIVERY_ENABLED = Number.isFinite(FREE_DELIVERY_THRESHOLD);
