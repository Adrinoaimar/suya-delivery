import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('scripts de build', () => {
  it('mantiene el build publicable separado del build demo con mocks', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts.build).toBe('npm run build:apps && npm run verify:production');
    expect(packageJson.scripts['build:demo']).toBe('tsc -b && vite build');
    expect(packageJson.scripts.build).not.toContain('vite build');
  });
});
