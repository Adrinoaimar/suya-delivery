import { createHash, createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'dist', 'customer', 'mobile-updates');
const bundleId = process.env.GITHUB_SHA ?? `local-${Date.now()}`;
const baseUrl = process.env.SUYA_LIVE_UPDATE_BASE_URL ?? 'https://suyadelivery.com';
const privateKey = process.env.SUYA_LIVE_UPDATE_PRIVATE_KEY;
const androidConfig = await readFile(path.join(repoRoot, 'android', 'app', 'build.gradle'), 'utf8');
const nativeVersion = Number(androidConfig.match(/^\s*versionCode\s+(\d+)\s*$/m)?.[1]);
const revision = Number(execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }));
if (!Number.isSafeInteger(nativeVersion) || nativeVersion < 1 || !Number.isSafeInteger(revision) || revision < 1) {
  throw new Error('No se pudo determinar la versión nativa o la revisión del bundle.');
}
const roles = ['customer', 'rider', 'backoffice', 'walletobserver', 'unified'];
const protectedRoles = new Set(['rider', 'backoffice', 'walletobserver']);
const customerPause = { version: 2, role: 'customer', disabled: true };

if (!privateKey) throw new Error('Falta SUYA_LIVE_UPDATE_PRIVATE_KEY para firmar los bundles móviles.');
if (!/^[a-zA-Z0-9._-]{1,128}$/.test(bundleId)) {
  throw new Error('GITHUB_SHA/SUYA bundleId no tiene un formato seguro.');
}

let parsedBaseUrl;
try {
  parsedBaseUrl = new URL(baseUrl);
} catch {
  throw new Error('SUYA_LIVE_UPDATE_BASE_URL debe ser una URL HTTPS de Suya.');
}
if (parsedBaseUrl.origin !== 'https://suyadelivery.com' || parsedBaseUrl.pathname !== '/') {
  throw new Error('SUYA_LIVE_UPDATE_BASE_URL debe ser exactamente https://suyadelivery.com.');
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

async function prepareRole(role) {
  const sourceName = role === 'unified' ? 'mobile' : role;
  const buildDir = path.join(repoRoot, 'dist', sourceName);
  const roleDir = path.join(outputDir, role);
  await mkdir(roleDir, { recursive: true });

  const archiveName = `${bundleId}.zip`;
  const archivePath = path.join(roleDir, archiveName);
  try {
    execFileSync('zip', ['-q', '-r', archivePath, '.'], { cwd: buildDir, stdio: 'inherit' });
  } catch (error) {
    throw new Error(`No se pudo crear el ZIP OTA del rol ${role}. Instala el comando zip.`, {
      cause: error,
    });
  }

  const archive = await readFile(archivePath);
  const checksum = createHash('sha256').update(archive).digest('hex');
  const signature = createSign('RSA-SHA256').update(archive).sign(privateKey, 'base64');
  const protectedRole = protectedRoles.has(role);
  const manifest = {
    version: protectedRole ? 2 : 1,
    role,
    bundleId,
    minimumNativeVersionCode: nativeVersion,
    revision,
    url: `${baseUrl}/mobile-updates/${role}/${archiveName}`,
    checksum,
    signature,
  };
  if (protectedRole) {
    const metadata = JSON.stringify([
      manifest.version, role, bundleId, nativeVersion, revision, manifest.url, checksum, signature,
    ]);
    manifest.manifestSignature = createSign('RSA-SHA256').update(metadata).sign(privateKey, 'base64');
  }

  await writeFile(path.join(roleDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

for (const role of roles) {
  if (role !== 'customer') await prepareRole(role);
}
const customerDir = path.join(outputDir, 'customer');
await mkdir(customerDir, { recursive: true });
await writeFile(path.join(customerDir, 'latest.json'), JSON.stringify(customerPause) + '\n');

// Las APK antiguas también pueden consultar la ruta raíz.
await writeFile(path.join(outputDir, 'latest.json'), JSON.stringify(customerPause) + '\n');

console.log(`Bundles móviles firmados: ${roles.filter((role) => role !== 'customer').join(', ')}`);
