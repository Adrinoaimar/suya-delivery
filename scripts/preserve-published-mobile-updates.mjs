import { createHash, verify } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const output = new URL('../dist/customer/mobile-updates/', import.meta.url);
const keySource = await readFile(new URL('../src/lib/mobileUpdatePublicKey.ts', import.meta.url), 'utf8');
const publicKey = keySource.match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/)?.[0];
if (!publicKey) throw new Error('Falta la clave pública OTA.');

const origin = 'https://suyadelivery.com/mobile-updates/';
async function download(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`OTA: ${response.status} al leer ${url}.`);
  return Buffer.from(await response.arrayBuffer());
}

for (const role of ['rider', 'backoffice', 'walletobserver', 'unified']) {
  const directory = new URL(role + '/', output);
  const latest = await download(origin + role + '/latest.json');
  const manifest = JSON.parse(latest);
  const {version, bundleId, minimumNativeVersionCode, revision, url, checksum, signature, manifestSignature} = manifest;
  const protectedRole = role === 'rider' || role === 'backoffice';
  if (manifest.role !== role || version !== (protectedRole ? 2 : 1)) {
    throw new Error(`Manifiesto OTA incompatible para ${role}.`);
  }
  await mkdir(directory, { recursive: true });
  if (manifest.disabled !== true) {
    if (!/^[a-zA-Z0-9._-]{1,128}$/.test(bundleId) || url !== origin + role + '/' + bundleId + '.zip') {
      throw new Error(`Identificador o URL OTA inválido para ${role}.`);
    }
    if (protectedRole) {
      const metadata = [version, role, bundleId, minimumNativeVersionCode, revision, url, checksum, signature];
      if (!verify('RSA-SHA256', Buffer.from(JSON.stringify(metadata)), publicKey, Buffer.from(manifestSignature, 'base64'))) {
        throw new Error(`Firma OTA de manifiesto inválida para ${role}.`);
      }
    }
    const archive = await download(url);
    if (createHash('sha256').update(archive).digest('hex') !== checksum
      || !verify('RSA-SHA256', archive, publicKey, Buffer.from(signature, 'base64'))) {
      throw new Error(`Firma o checksum del ZIP OTA inválido para ${role}.`);
    }
    await writeFile(new URL(bundleId + '.zip', directory), archive);
  }
  await writeFile(new URL('latest.json', directory), latest);
  console.log(`OTA conservado para ${role}.`);
}
