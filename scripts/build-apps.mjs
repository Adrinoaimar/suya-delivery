import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { assertProductionBuildConfig } from './lib/production-build-config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supportedApps = ['customer', 'rider', 'backoffice'];
const requested = process.argv[2] ? [process.argv[2]] : supportedApps;

assertProductionBuildConfig();

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


