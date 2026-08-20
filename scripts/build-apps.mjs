import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { isSafeSupabasePublishableKey } from './lib/public-supabase-key.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supportedApps = ['customer', 'rider', 'backoffice'];
const requested = process.argv[2] ? [process.argv[2]] : supportedApps;

const backend = process.env.VITE_BACKEND;
const mapProvider = process.env.VITE_MAP_PROVIDER;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const expectedProjectRef = process.env.VITE_EXPECTED_SUPABASE_PROJECT_REF;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const actualProjectRef = supabaseUrl?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1];
const productionFailures = [];

if (backend !== 'supabase') productionFailures.push('VITE_BACKEND=supabase');
if (mapProvider !== 'osm') productionFailures.push('VITE_MAP_PROVIDER=osm');
if (!actualProjectRef) productionFailures.push('VITE_SUPABASE_URL válida');
if (!expectedProjectRef || actualProjectRef !== expectedProjectRef) {
  productionFailures.push('VITE_EXPECTED_SUPABASE_PROJECT_REF coincidente');
}
if (!isSafeSupabasePublishableKey(publishableKey)) {
  productionFailures.push('VITE_SUPABASE_PUBLISHABLE_KEY pública válida');
}
if (productionFailures.length > 0) {
  throw new Error(
    `Build productivo rechazado. Configura ${productionFailures.join(', ')}; ` +
      'el modo demo solo puede usarse con npm run dev.',
  );
}

if (requested.length === supportedApps.length) {
  await rm(path.join(repoRoot, 'dist'), { recursive: true, force: true });
}

for (const app of requested) {
  if (!supportedApps.includes(app)) {
    throw new Error(`Aplicación desconocida: ${app}. Usa ${supportedApps.join(', ')}.`);
  }

  await build({
    root: path.join(repoRoot, 'apps', app),
    base: process.env.VITE_BASE ?? '/',
    envDir: repoRoot,
    publicDir: path.join(repoRoot, 'public'),
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.join(repoRoot, 'src'),
      },
    },
    build: {
      outDir: path.join(repoRoot, 'dist', app),
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
              return 'react';
            }
            if (id.includes('node_modules/leaflet')) return 'leaflet';
            return undefined;
          },
        },
      },
    },
  });

  if (app !== 'customer') {
    const output = path.join(repoRoot, 'dist', app);
    await Promise.all([
      rm(path.join(output, 'sw.js'), { force: true }),
      rm(path.join(output, 'manifest'), { recursive: true, force: true }),
    ]);
  }
}

