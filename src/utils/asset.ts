const BASE = import.meta.env.BASE_URL;

const OPTIMIZED_ASSETS: Record<string, string> = {
  '/images/stores/donde-joel/cover.png': '/images/stores/donde-joel/cover.webp',
  '/images/stores/donde-joel/logo.png': '/images/stores/donde-joel/logo.webp',
  '/images/stores/anda-paya/cover-restaurante-background.png':
    '/images/stores/anda-paya/cover-restaurante-background.webp',
  '/images/stores/anda-paya/cover-cevicheria-background.png':
    '/images/stores/anda-paya/cover-cevicheria-background.webp',
};

/**
 * Resuelve una ruta de `public/` contra la base del sitio.
 *
 * Los datos de `src/data` escriben las rutas desde la raíz pública (`/images/...`),
 * pero el sitio puede servirse bajo una subruta (GitHub Pages: `/suya-delivery/`).
 */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const rawValue = path.trim();
  const value = OPTIMIZED_ASSETS[rawValue] ?? rawValue;
  if (!value) return undefined;
  if (/^(https?:)?\/\//i.test(value)) return value;
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)) return value;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return undefined;
  return value.startsWith('/') ? `${BASE}${value.slice(1)}` : value;
}

/** Conserva una referencia editable de activo y rechaza esquemas no renderizables. */
export function normalizeAssetInput(path: string | null | undefined): string | null {
  if (path === null || path === undefined) return null;
  const value = path.trim();
  if (!value) return null;
  if (!assetUrl(value)) {
    throw new Error('La imagen debe usar una ruta local, una URL HTTP(S) o una imagen raster inline.');
  }
  return value;
}
