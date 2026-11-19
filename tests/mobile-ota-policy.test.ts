import { createSign, generateKeyPairSync, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasValidUpdateManifestSignature, isNewerProtectedUpdate } from '@/lib/mobileUpdatePolicy';
import type { ProtectedMobileUpdate } from '@/lib/mobileUpdatePolicy';

const update: ProtectedMobileUpdate = {
  version: 2, role: 'backoffice', bundleId: 'release-123',
  url: 'https://suyadelivery.com/mobile-updates/backoffice/release-123.zip',
  checksum: 'a'.repeat(64), signature: 'signed zip', minimumNativeVersionCode: 24,
  revision: 1200, manifestSignature: 'signed manifest',
};

afterEach(() => vi.unstubAllGlobals());

describe('OTA protegido de Empresas y Repartidor', () => {
  it('exige el APK compatible y una revisión superior a la instalada o aceptada', () => {
    expect(isNewerProtectedUpdate(update, 24, 1100, 1150)).toBe(true);
    expect(isNewerProtectedUpdate(update, 23, 1100, 1150)).toBe(false);
    expect(isNewerProtectedUpdate(update, 25, 1100, 1150)).toBe(false);
    expect(isNewerProtectedUpdate(update, 24, 1200, 0)).toBe(false);
    expect(isNewerProtectedUpdate(update, 24, 1100, 1200)).toBe(false);
    expect(isNewerProtectedUpdate(update, 24, 0, 0)).toBe(false);
  });

  it('rechaza la revisión, el rol o el artefacto alterado después de firmar', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const andSignature = {
      ...update,
      manifestSignature: createSign('RSA-SHA256').update(JSON.stringify([
        update.version, update.role, update.bundleId, update.minimumNativeVersionCode,
        update.revision, update.url, update.checksum, update.signature,
      ])).sign(keys.privateKey, 'base64'),
    };
    expect(await hasValidUpdateManifestSignature(andSignature, pem)).toBe(true);
    expect(await hasValidUpdateManifestSignature({ ...andSignature, revision: 9999 }, pem)).toBe(false);
    expect(await hasValidUpdateManifestSignature({ ...andSignature, role: 'rider' }, pem)).toBe(false);
    expect(await hasValidUpdateManifestSignature({ ...andSignature, checksum: 'b'.repeat(64) }, pem)).toBe(false);
  });
});
