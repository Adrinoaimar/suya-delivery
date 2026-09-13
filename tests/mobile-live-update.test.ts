import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (path: string) => resolve(process.cwd(), path);

describe('actualizaciones nativas por rol', () => {
  it('no permite que Rider o Back Office instalen el bundle de Suya Cliente', () => {
    const liveUpdate = readFileSync(root('src/lib/liveUpdate.ts'), 'utf8');
    const apkBuilder = readFileSync(root('scripts/build-mobile-apks.mjs'), 'utf8');
    const appBuilder = readFileSync(root('scripts/build-apps.mjs'), 'utf8');
    const androidBuild = readFileSync(root('android/app/build.gradle'), 'utf8');
    const iosProject = readFileSync(root('ios/App/App.xcodeproj/project.pbxproj'), 'utf8');

    expect(liveUpdate).toContain('VITE_MOBILE_ROLE');
    expect(liveUpdate).toContain("mobileRole !== 'customer'");
    expect(liveUpdate).toContain("const mobileRole = import.meta.env.VITE_MOBILE_ROLE?.trim();");
    expect(liveUpdate).not.toContain("|| 'customer'");
    expect(apkBuilder).toContain('VITE_MOBILE_ROLE: target.build');
    expect(appBuilder).toContain("const mobileRole = app === 'mobile' ? 'unified' : app;");
    expect(appBuilder).toContain("'import.meta.env.VITE_MOBILE_ROLE'");
    expect(androidBuild).toContain('versionCode 2');
    expect(iosProject).toContain('CURRENT_PROJECT_VERSION = 2;');
  });
});
