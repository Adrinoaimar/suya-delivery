import { Capacitor } from '@capacitor/core';

const UPDATE_BASE_URL = 'https://suyadelivery.com/mobile-updates';
const UPDATE_ORIGIN = 'https://suyadelivery.com';
const UPDATE_PATH_PREFIX = '/mobile-updates/';
const UPDATE_TIMEOUT_MS = 10_000;
const MOBILE_ROLES = new Set(['customer', 'rider', 'backoffice', 'walletobserver', 'unified']);

interface MobileUpdateManifest {
  version: 1;
  role: string;
  bundleId: string;
  url: string;
  checksum: string;
  signature: string;
}

function isManifest(value: unknown, expectedRole: string): value is MobileUpdateManifest {
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
    manifest.role === expectedRole &&
    typeof manifest.bundleId === 'string' &&
    /^[a-zA-Z0-9._-]{1,128}$/.test(manifest.bundleId) &&
    artifactUrl.origin === UPDATE_ORIGIN &&
    artifactUrl.pathname === `${UPDATE_PATH_PREFIX}${expectedRole}/${manifest.bundleId}.zip` &&
    !artifactUrl.search &&
    !artifactUrl.hash &&
    typeof manifest.checksum === 'string' &&
    /^[a-f0-9]{64}$/.test(manifest.checksum) &&
    typeof manifest.signature === 'string' &&
    manifest.signature.length > 0
  );
}

/**
 * Checks for a signed web bundle for this native role and stages it for the
 * next app launch. Native code stays in the APK; HTML/CSS/JS changes arrive
 * from Pages. A role can never install another role's bundle.
 */
export async function syncMobileLiveUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { LiveUpdate } = await import('@capawesome/capacitor-live-update');
    await LiveUpdate.ready();

    const mobileRole = import.meta.env.VITE_MOBILE_ROLE?.trim();
    if (!mobileRole || !MOBILE_ROLES.has(mobileRole)) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
    try {
      const response = await fetch(`${UPDATE_BASE_URL}/${mobileRole}/latest.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return;
      if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return;

      const manifest: unknown = await response.json();
      if (!isManifest(manifest, mobileRole)) return;

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
