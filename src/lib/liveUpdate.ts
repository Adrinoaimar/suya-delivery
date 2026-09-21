import { Capacitor } from '@capacitor/core';

const UPDATE_MANIFEST_URL = 'https://suyadelivery.com/mobile-updates/latest.json';
const UPDATE_ORIGIN = 'https://suyadelivery.com';
const UPDATE_PATH_PREFIX = '/mobile-updates/';
const UPDATE_TIMEOUT_MS = 10_000;

interface MobileUpdateManifest {
  version: 1;
  bundleId: string;
  url: string;
  checksum: string;
  signature: string;
}

function isManifest(value: unknown): value is MobileUpdateManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<MobileUpdateManifest>;
  let artifactUrl: URL;
  try {
    artifactUrl = new URL(typeof manifest.url === 'string' ? manifest.url : '');
  } catch {
    return false;
  }

  return (
    manifest.version === 1 &&
    typeof manifest.bundleId === 'string' &&
    /^[a-zA-Z0-9._-]{1,128}$/.test(manifest.bundleId) &&
    artifactUrl.origin === UPDATE_ORIGIN &&
    artifactUrl.pathname.startsWith(UPDATE_PATH_PREFIX) &&
    artifactUrl.pathname.endsWith('.zip') &&
    !artifactUrl.search &&
    !artifactUrl.hash &&
    typeof manifest.checksum === 'string' &&
    /^[a-f0-9]{64}$/.test(manifest.checksum) &&
    typeof manifest.signature === 'string' &&
    manifest.signature.length > 0
  );
}

/**
 * Checks for a signed web bundle and stages it for the next app launch.
 * Native code stays in the APK; HTML/CSS/JS changes arrive from Pages.
 */
export async function syncMobileLiveUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { LiveUpdate } = await import('@capawesome/capacitor-live-update');
    await LiveUpdate.ready();

    // El manifiesto publicado hoy contiene únicamente el bundle de Suya Cliente.
    // Los roles nativos no deben instalarlo como siguiente bundle: al reiniciar
    // Rider o Back Office eso los convertiría en la app del cliente.
    const mobileRole = import.meta.env.VITE_MOBILE_ROLE?.trim();
    if (mobileRole !== 'customer') return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
    try {
      const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return;
      if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return;

      const manifest: unknown = await response.json();
      if (!isManifest(manifest)) return;

      const { bundleId: currentBundleId } = await LiveUpdate.getCurrentBundle();
      if (currentBundleId === manifest.bundleId) return;

      await LiveUpdate.downloadBundle({
        artifactType: 'zip',
        bundleId: manifest.bundleId,
        checksum: manifest.checksum,
        signature: manifest.signature,
        url: manifest.url,
      });
      await LiveUpdate.setNextBundle({ bundleId: manifest.bundleId });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // A failed optional update must never prevent the bundled app from opening.
  }
}
