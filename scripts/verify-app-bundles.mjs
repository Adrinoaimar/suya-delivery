import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forbiddenByApp = {
  customer: [
    'BackofficePage',
    'RiderCurrentPage',
    'RiderEarningsPage',
    'RiderHistoryPage',
    'RiderHomePage',
    'RiderSafetyPage',
    'RiderSettingsPage',
    'Suya Operaciones',
  ],
  rider: [
    'BackofficePage',
    'CartPage',
    'CheckoutPage',
    'PromotionsPage',
    'StoreDetailPage',
    'StoresPage',
    'Suya Operaciones',
  ],
  backoffice: [
    'CartPage',
    'CheckoutPage',
    'MockMap',
    'RiderCurrentPage',
    'RiderHomePage',
    'StoreDetailPage',
  ],
};

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(absolute) : [absolute];
    }),
  );
  return nested.flat();
}

const requested = process.argv[2];
const apps = requested ? [requested] : Object.keys(forbiddenByApp);
const failures = [];

for (const app of apps) {
  if (!(app in forbiddenByApp)) throw new Error(`Aplicación desconocida: ${app}`);
  const output = path.join(repoRoot, 'dist', app);
  const files = await filesBelow(output);
  const searchable = files.filter((file) => /\.(?:html|js)$/.test(file));

  for (const marker of forbiddenByApp[app]) {
    const matchByName = files.find((file) => path.basename(file).includes(marker));
    let matchByContent;
    for (const file of searchable) {
      if ((await readFile(file, 'utf8')).includes(marker)) {
        matchByContent = file;
        break;
      }
    }
    const match = matchByName ?? matchByContent;
    if (match) failures.push(`${app}: contiene ${marker} en ${path.relative(repoRoot, match)}`);
  }

  if (app !== 'customer') {
    for (const customerAsset of ['sw.js', path.join('manifest', 'manifest.webmanifest')]) {
      if (files.includes(path.join(output, customerAsset))) {
        failures.push(`${app}: contiene activo PWA exclusivo del cliente: ${customerAsset}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Aislamiento de aplicaciones inválido:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Bundles aislados: ${apps.join(', ')}`);
}
