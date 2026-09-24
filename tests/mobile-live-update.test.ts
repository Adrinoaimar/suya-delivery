import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (path: string) => resolve(process.cwd(), path);

describe('actualizaciones nativas por rol', () => {
  it('no permite que Rider o Back Office instalen el bundle de Suya Cliente', () => {
    const liveUpdate = readFileSync(root('src/lib/liveUpdate.ts'), 'utf8');
    const apkBuilder = readFileSync(root('scripts/build-mobile-apks.mjs'), 'utf8');
    const appBuilder = readFileSync(root('scripts/build-apps.mjs'), 'utf8');
    const apkVerifier = readFileSync(root('scripts/verify-android-apks.mjs'), 'utf8');
    const androidBuild = readFileSync(root('android/app/build.gradle'), 'utf8');
    const iosProject = readFileSync(root('ios/App/App.xcodeproj/project.pbxproj'), 'utf8');

    expect(liveUpdate).toContain('VITE_MOBILE_ROLE');
    expect(liveUpdate).toContain("!mobileRole || !MOBILE_ROLES.has(mobileRole)");
    expect(liveUpdate).toContain("const mobileRole = import.meta.env.VITE_MOBILE_ROLE?.trim();");
    expect(liveUpdate).not.toContain("|| 'customer'");
    expect(liveUpdate).toContain('new URL');
    expect(liveUpdate).toContain('AbortController');
    expect(liveUpdate).toContain('UPDATE_TIMEOUT_MS');
    expect(liveUpdate).toContain('manifest.role === expectedRole');
    expect(liveUpdate).toContain('expectedRole}/');
    expect(apkBuilder).toContain('VITE_MOBILE_ROLE: target.build');
    expect(apkBuilder).toContain("appId: 'com.suya.app'");
    expect(apkBuilder).toContain("artifactPrefix: 'Suya-Cliente'");
    expect(appBuilder).toContain("const mobileRole = app === 'mobile' ? 'unified' : app;");
    expect(appBuilder).toContain("'import.meta.env.VITE_MOBILE_ROLE'");
    expect(apkVerifier).toContain("packageName: 'com.suya.app'");
    expect(apkVerifier).toContain("releaseBuild ? '-1.7-code8-release.apk' : '-debug.apk'");
    expect(apkBuilder).toContain("const releaseBuild = args.includes('--release');");
    expect(apkBuilder).toContain("'SUYA_RELEASE_STORE_FILE'");
    expect(androidBuild).toContain('versionCode 8');
    expect(androidBuild).toContain('versionName "1.7"');
    expect(iosProject).toContain('CURRENT_PROJECT_VERSION = 2;');
  });

  it('fija el origen del artefacto y rechaza bundle IDs inseguros al preparar OTA', () => {
    const prepare = readFileSync(root('scripts/prepare-mobile-live-update.mjs'), 'utf8');

    expect(prepare).toContain("parsedBaseUrl.origin !== 'https://suyadelivery.com'");
    expect(prepare).toContain("parsedBaseUrl.pathname !== '/'");
    expect(prepare).toContain("/^[a-zA-Z0-9._-]{1,128}$/");
    expect(prepare).toContain("['customer', 'rider', 'backoffice', 'walletobserver', 'unified']");
    expect(prepare).toContain("path.join(outputDir, 'latest.json')");
  });
});
