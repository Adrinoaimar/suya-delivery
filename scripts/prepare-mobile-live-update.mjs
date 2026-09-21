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
const roles = ['customer', 'rider', 'backoffice', 'walletobserver', 'unified'];

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
  const signer = createSign('RSA-SHA256');
  signer.update(archive);
  signer.end();
  const signature = signer.sign(privateKey, 'base64');
  const manifest = {
    version: 1,
    role,
    bundleId,
    url: `${baseUrl}/mobile-updates/${role}/${archiveName}`,
    checksum,
    signature,
  };

  await writeFile(path.join(roleDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

const manifests = new Map();
for (const role of roles) manifests.set(role, await prepareRole(role));

// Compatibilidad con APKs de cliente que ya conocen solo el manifiesto raíz.
// Su URL sigue apuntando al ZIP del subdirectorio customer, que el validador
// antiguo acepta porque conserva el prefijo /mobile-updates/.
await writeFile(
  path.join(outputDir, 'latest.json'),
  `${JSON.stringify(manifests.get('customer'), null, 2)}\n`,
);

console.log(`Bundles móviles firmados: ${roles.join(', ')}`);
