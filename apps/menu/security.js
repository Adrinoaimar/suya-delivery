const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const RASTER_DATA = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;

export function safeHexColor(value, fallback = '#0B7048') {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;
}

export function safeImageUrl(value, baseUrl = globalThis.location?.href ?? 'http://localhost/') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return '';
  if (RASTER_DATA.test(value)) return value;
  if (/[<>"'();`]/.test(value)) return '';

  try {
    const url = new URL(value, baseUrl);
    const base = new URL(baseUrl);
    if (url.protocol === 'https:') return url.href;
    if (url.protocol === 'http:' && base.protocol === 'http:' && url.hostname === base.hostname) {
      return url.href;
    }
  } catch {
    return '';
  }
  return '';
}
