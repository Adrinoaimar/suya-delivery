import { Capacitor } from '@capacitor/core';

const UPDATE_MANIFEST_URL = 'https://suyadelivery.com/mobile-updates/latest.json';

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
  return (
    manifest.version === 1 &&
    typeof manifest.bundleId === 'string' &&
    /^[a-zA-Z0-9._-]{1,128}$/.test(manifest.bundleId) &&
    typeof manifest.url === 'string' &&
    manifest.url.startsWith('https://suyadelivery.com/mobile-updates/') &&
    manifest.url.endsWith('.zip') &&
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
    const mobileRole = import.meta.env.VITE_MOBILE_ROLE?.trim() || 'customer';
    if (mobileRole !== 'customer') return;

    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;

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
  } catch {
    // A failed optional update must never prevent the bundled app from opening.
  }
}
