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
    'MockOrderService',
    'MockStoreService',
    'MockPaymentService',
  ],
  rider: [
    'BackofficePage',
    'CartPage',
    'CheckoutPage',
    'PromotionsPage',
    'StoreDetailPage',
    'StoresPage',
    'Suya Operaciones',
    'MockOrderService',
    'MockStoreService',
    'MockPaymentService',
  ],
  backoffice: [
    'CartPage',
    'CheckoutPage',
    'MockMap',
    'RiderCurrentPage',
    'RiderHomePage',
    'StoreDetailPage',
    'MockOrderService',
    'MockStoreService',
    'MockPaymentService',
  ],
  walletobserver: [
    'BackofficePage',
    'BackofficeLayout',
    'RiderCurrentPage',
    'RiderHomePage',
    'RiderSafetyPage',
    'CheckoutPage',
    'MockOrderService',
    'MockStoreService',
    'MockPaymentService',
  ],
  mobile: [
    'MockOrderService',
    'MockStoreService',
    'MockPaymentService',
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
const apps = requested ? [requested] : ['customer', 'rider', 'backoffice'];
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
  } else {
    const requiredAssets = ['robots.txt', 'sitemap.xml', 'llms.txt', '_redirects', '404.html'];
    for (const asset of requiredAssets) {
      if (!files.includes(path.join(output, asset))) {
        failures.push(`customer: falta activo SEO ${asset}`);
      }
    }

    const publicRoutes = [
      'index.html',
      path.join('delivery-sullana', 'index.html'),
      path.join('comida-a-domicilio-sullana', 'index.html'),
      path.join('restaurantes-delivery-sullana', 'index.html'),
      path.join('stores', 'index.html'),
      path.join('help', 'index.html'),
      path.join('nosotros', 'index.html'),
      path.join('contacto', 'index.html'),
      path.join('privacidad', 'index.html'),
      path.join('terminos', 'index.html'),
      path.join('menu', 'anda-paya-menu', 'index.html'),
      path.join('menu', 'anda-paya-cevicheria-menu', 'index.html'),
      path.join('menu', 'donde-joel-menu', 'index.html'),
      path.join('menu', 'tio-jhony-menu', 'index.html'),
      path.join('menu', 'la-waka-menu', 'index.html'),
    ];
    for (const route of publicRoutes) {
      const file = path.join(output, route);
      if (!files.includes(file)) {
        failures.push(`customer: falta HTML público ${route}`);
        continue;
      }
      const html = await readFile(file, 'utf8');
      for (const marker of ['rel="canonical"', 'application/ld+json', 'data-static-seo=', '<h1']) {
        if (!html.includes(marker)) failures.push(`customer: ${route} no contiene ${marker}`);
      }
    }

    const privateShell = path.join(output, '_private');
    if (!files.includes(privateShell)) {
      failures.push('customer: falta HTML noindex para rutas funcionales privadas');
    } else {
      const html = await readFile(privateShell, 'utf8');
      if (!html.includes('noindex,nofollow')) failures.push('customer: shell privado indexable');
      if (html.includes('rel="canonical"')) failures.push('customer: shell privado con canonical falso');
      if (html.includes('application/ld+json')) failures.push('customer: shell privado con schema público');
    }

    const notFound = path.join(output, '404.html');
    if (files.includes(notFound)) {
      const html = await readFile(notFound, 'utf8');
      if (!html.includes('noindex,nofollow')) failures.push('customer: 404 indexable');
      if (!html.includes('Página no encontrada')) failures.push('customer: 404 sin contenido explícito');
    }
  }
}

if (failures.length > 0) {
  console.error(`Aislamiento de aplicaciones inválido:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Bundles aislados: ${apps.join(', ')}`);
}

