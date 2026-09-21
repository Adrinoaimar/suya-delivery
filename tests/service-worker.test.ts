import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (path: string) => resolve(process.cwd(), path);

describe('aislamiento del Service Worker', () => {
  it('limpia un PWA de Cliente que haya quedado registrado en Rider o Back Office', () => {
    const mount = readFileSync(root('src/entries/mount.tsx'), 'utf8');
    const cleanup = readFileSync(root('src/lib/serviceWorker.ts'), 'utf8');

    expect(mount).toContain("mobileRole === 'rider' || mobileRole === 'backoffice'");
    expect(mount).toContain('removeStaleCustomerServiceWorker();');
    expect(cleanup).toContain('getRegistrations');
    expect(cleanup).toContain('registration.unregister()');
    expect(cleanup).toContain("key.startsWith('suya-shell-')");
  });
});
