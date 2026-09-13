import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repoRoot, 'output', 'android');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const targets = {
  rider: {
    build: 'rider',
    appId: 'com.suya.rider',
    appName: 'Suya Repartidor',
    oauthScheme: 'com.suya.rider',
    artifact: 'Suya-Rider-debug.apk',
  },
  backoffice: {
    build: 'backoffice',
    appId: 'com.suya.backoffice',
    appName: 'Suya Backoffice',
    oauthScheme: 'com.suya.backoffice',
    artifact: 'Suya-Backoffice-debug.apk',
  },
};

const requested = process.argv[2] ? [process.argv[2]] : Object.keys(targets);
for (const name of requested) {
  if (!(name in targets)) {
    throw new Error(`Rol desconocido: ${name}. Usa rider, backoffice o ambos.`);
  }
}

function run(command, args, env) {
  execFileSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const name of requested) {
  const target = targets[name];
  const targetEnv = {
    SUYA_ANDROID_APP_ID: target.appId,
    SUYA_ANDROID_APP_NAME: target.appName,
    SUYA_MOBILE_APP_ID: target.appId,
    SUYA_MOBILE_APP_NAME: target.appName,
    SUYA_MOBILE_WEB_DIR: `dist/${target.build}`,
    VITE_MOBILE_ROLE: target.build,
    VITE_NATIVE_OAUTH_SCHEME: target.oauthScheme,
  };

  console.log(`\n==> Construyendo APK ${target.appName}`);
  run(npmCommand, ['run', `build:${target.build}`], targetEnv);
  run(npxCommand, ['--no-install', 'cap', 'sync', 'android'], targetEnv);
  run('bash', ['android/gradlew', '-p', 'android', 'assembleDebug', '--no-daemon'], targetEnv);

  const apk = path.join(repoRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  await cp(apk, path.join(outputRoot, target.artifact));
  console.log(`APK listo: output/android/${target.artifact}`);
}

console.log(`\nAPKs generados: ${requested.join(', ')}`);
