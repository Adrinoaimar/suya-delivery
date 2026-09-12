const BASE = import.meta.env.BASE_URL;

/**
 * Resuelve una ruta de `public/` contra la base del sitio.
 *
 * Los datos de `src/data` escriben las rutas desde la raíz pública (`/images/...`),
 * pero el sitio puede servirse bajo una subruta (GitHub Pages: `/suya-delivery/`).
 */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const value = path.trim();
  if (!value) return undefined;
  if (/^(https?:)?\/\//i.test(value)) return value;
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) return value;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return undefined;
  return value.startsWith('/') ? `${BASE}${value.slice(1)}` : value;
}
