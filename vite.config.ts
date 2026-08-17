/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages sirve el sitio bajo /<repo>/. `VITE_BASE` lo define el workflow;
// en local y en la raíz de un dominio propio queda en '/'.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Separa el runtime de React del código de la aplicación para cachearlo mejor.
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
  test: {
    // `threads` evita el fallo de arranque de los workers cuando la ruta del proyecto
    // contiene espacios (por ejemplo «Nueva carpeta») en Windows.
    pool: 'threads',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
  },
});
