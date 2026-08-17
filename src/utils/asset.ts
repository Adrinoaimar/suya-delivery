const BASE = import.meta.env.BASE_URL;

/**
 * Resuelve una ruta de `public/` contra la base del sitio.
 *
 * Los datos de `src/data` escriben las rutas desde la raíz pública (`/images/...`),
 * pero el sitio puede servirse bajo una subruta (GitHub Pages: `/suya-delivery/`).
 */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path;
  return path.startsWith('/') ? `${BASE}${path.slice(1)}` : path;
}
