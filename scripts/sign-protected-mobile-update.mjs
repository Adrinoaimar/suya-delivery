import { createHash, createPublicKey, sign } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const requestFile = process.argv[2];
const output = process.argv[3];

const request = JSON.parse(await readFile(requestFile, 'utf8'));
const { bundleId, revision, nativeVersion, preview, checksums } = request;
const roles = ['backoffice', 'rider'];

if (!/^[a-f0-9]{40}$/.test(bundleId) || !Number.isSafeInteger(revision) || revision < 1
  || !Number.isSafeInteger(nativeVersion) || nativeVersion < 1
  || !/^https:\/\/[a-f0-9]{8}\.suya-customer\.pages\.dev$/.test(preview)
  || !roles.every((role) => /^[a-f0-9]{64}$/.test(checksums?.[role]))) {
  throw new Error('Solicitud de firma OTA inválida.');
}

const privateKey = process.env.SUYA_LIVE_UPDATE_PRIVATE_KEY;
if (!privateKey) throw new Error('Falta el secreto de firma de Suya.');
const expectedKey = (await readFile(new URL('../src/lib/mobileUpdatePublicKey.ts', import.meta.url), 'utf8'))
  .match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/)?.[0];
if (!expectedKey || !createPublicKey(privateKey).equals(createPublicKey(expectedKey))) {
  throw new Error('La firma configurada en GitHub debe corresponder a la clave pública de las APK.');
}

for (const role of roles) {
  const archivePath = `/mobile-updates/${role}/${bundleId}.zip`;
  const response = await fetch(preview + archivePath, { redirect: 'error', signal: AbortSignal.timeout(40_000) });
  if (!response.ok) throw new Error(`Vista previa OTA ${role}: HTTP ${response.status}.`);
  const archive = Buffer.from(await response.arrayBuffer());
  const checksum = createHash('sha256').update(archive).digest('hex');
  if (checksum !== checksums[role] || archive.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`El ZIP de ${role} no coincide con el hash aprobado.`);
  }

  const url = 'https://suyadelivery.com' + archivePath;
  const signature = sign('RSA-SHA256', archive, privateKey).toString('base64');
  const version = 2;
  const metadata = [version, role, bundleId, nativeVersion, revision, url, checksum, signature];
  const manifestSignature = sign('RSA-SHA256', Buffer.from(JSON.stringify(metadata)), privateKey).toString('base64');
  const manifest = { version, role, bundleId, minimumNativeVersionCode: nativeVersion, revision, url, checksum, signature, manifestSignature };
  await mkdir(path.join(output, role), { recursive: true });
  await writeFile(path.join(output, role, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Firmado ${role} para Android ${nativeVersion}, revisión ${revision}.`);
}
