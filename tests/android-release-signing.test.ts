import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const gradle = readFileSync(
  path.join(process.cwd(), 'android/app/build.gradle'),
  'utf8',
);

describe('contrato estático de firma Android release', () => {
  it('exige las cuatro variables de la clave sin incluir contraseñas en el código', () => {
    for (const name of [
      'SUYA_RELEASE_STORE_FILE',
      'SUYA_RELEASE_STORE_PASSWORD',
      'SUYA_RELEASE_KEY_ALIAS',
      'SUYA_RELEASE_KEY_PASSWORD',
    ]) {
      expect(gradle).toContain(`System.getenv('${name}')`);
    }
    expect(gradle).toContain('suyaSigningProvided && !suyaSigningComplete');
    expect(gradle).toContain('Firma release incompleta');
  });

  it('solo asigna la configuración release cuando la clave está completa', () => {
    expect(gradle).toMatch(/signingConfigs\s*\{\s*if \(suyaSigningComplete\)/u);
    expect(gradle).toMatch(/buildTypes\s*\{\s*release\s*\{\s*if \(suyaSigningComplete\)\s*\{\s*signingConfig signingConfigs\.release/u);
    expect(gradle).not.toMatch(/signingConfig signingConfigs\.debug/u);
  });
});
