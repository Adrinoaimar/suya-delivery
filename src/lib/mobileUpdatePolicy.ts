import { liveUpdatePublicKey } from './mobileUpdatePublicKey';

export interface ProtectedMobileUpdate {
  version: 2;
  role: string;
  bundleId: string;
  url: string;
  checksum: string;
  signature: string;
  minimumNativeVersionCode: number;
  revision: number;
  manifestSignature: string;
}

export function isNewerProtectedUpdate(
  manifest: ProtectedMobileUpdate,
  nativeVersion: number,
  builtInRevision: number,
  acceptedRevision: number,
): boolean {
  return Number.isSafeInteger(nativeVersion) && nativeVersion > 0
    && manifest.minimumNativeVersionCode === nativeVersion
    && Number.isSafeInteger(builtInRevision) && builtInRevision > 0
    && Number.isSafeInteger(manifest.revision)
    && manifest.revision > Math.max(builtInRevision, acceptedRevision)
    && typeof manifest.manifestSignature === 'string' && manifest.manifestSignature.length <= 1024;
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function hasValidUpdateManifestSignature(
  manifest: ProtectedMobileUpdate,
  publicKey = liveUpdatePublicKey,
): Promise<boolean> {
  try {
    const spki = publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const key = await crypto.subtle.importKey('spki', fromBase64(spki), algorithm, false, ['verify']);
    const message = new TextEncoder().encode(JSON.stringify([
      manifest.version, manifest.role, manifest.bundleId, manifest.minimumNativeVersionCode,
      manifest.revision, manifest.url, manifest.checksum, manifest.signature,
    ]));
    return await crypto.subtle.verify(algorithm, key, fromBase64(manifest.manifestSignature), message);
  } catch {
    return false;
  }
}
