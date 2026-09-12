import { createHash, createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(repoRoot, 'dist', 'mobile');
const outputDir = path.join(repoRoot, 'dist', 'customer', 'mobile-updates');
const bundleId = process.env.GITHUB_SHA ?? `local-${Date.now()}`;
const baseUrl = process.env.SUYA_LIVE_UPDATE_BASE_URL ?? 'https://suyadelivery.com';
const privateKey = process.env.SUYA_LIVE_UPDATE_PRIVATE_KEY;

if (!privateKey) throw new Error('Falta SUYA_LIVE_UPDATE_PRIVATE_KEY para firmar el bundle móvil.');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const archiveName = `${bundleId}.zip`;
const archivePath = path.join(outputDir, archiveName);
try {
  execFileSync('zip', ['-q', '-r', archivePath, '.'], { cwd: buildDir, stdio: 'inherit' });
} catch (error) {
  throw new Error('No se pudo crear el ZIP del bundle móvil. Instala el comando zip.', {
    cause: error,
  });
}

const archive = await readFile(archivePath);
const checksum = createHash('sha256').update(archive).digest('hex');
const signer = createSign('RSA-SHA256');
signer.update(archive);
signer.end();
const signature = signer.sign(privateKey, 'base64');

await writeFile(
  path.join(outputDir, 'latest.json'),
  `${JSON.stringify(
    {
      version: 1,
      bundleId,
      url: `${baseUrl}/mobile-updates/${archiveName}`,
      checksum,
      signature,
    },
    null,
    2,
  )}\n`,
);

console.log(`Bundle móvil firmado: ${archiveName}`);
