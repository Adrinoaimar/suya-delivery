import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repoRoot, 'output', 'android');
const androidBuildConfig = await readFile(path.join(repoRoot, 'android', 'app', 'build.gradle'), 'utf8');
const versionCode = androidBuildConfig.match(/^\s*versionCode\s+(\d+)\s*$/m)?.[1];
const versionName = androidBuildConfig.match(/^\s*versionName\s+"([^"]+)"\s*$/m)?.[1];
if (!versionCode || !versionName) throw new Error('No se pudo leer la versión Android de android/app/build.gradle.');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = process.argv.slice(2);
const releaseBuild = args.includes('--release');
const buildType = releaseBuild ? 'release' : 'debug';

const targets = {
  customer: {
    build: 'customer',
    appId: 'com.suya.app',
    appName: 'Suya Cliente',
    oauthScheme: 'com.suya.app',
    artifactPrefix: 'Suya-Cliente',
  },
  rider: {
    build: 'rider',
    appId: 'com.suya.rider',
    appName: 'Suya Repartidor',
    oauthScheme: 'com.suya.rider',
    artifactPrefix: 'Suya-Rider',
  },
  backoffice: {
    build: 'backoffice',
    appId: 'com.suya.backoffice',
    appName: 'Suya Backoffice',
    oauthScheme: 'com.suya.backoffice',
    artifactPrefix: 'Suya-Backoffice',
  },
  walletobserver: {
    build: 'walletobserver',
    appId: 'com.suya.walletobserver',
    appName: 'Suya Caja',
    oauthScheme: 'com.suya.walletobserver',
    artifactPrefix: 'Suya-Wallet-Observer',
  },
};

const requested = args.filter((argument) => argument !== '--release');
if (requested.includes('all')) {
  if (requested.length !== 1) throw new Error('Usa all por sí solo, con o sin --release.');
  requested.splice(0, requested.length, ...Object.keys(targets));
}
if (requested.length === 0) requested.push(...Object.keys(targets));
for (const name of requested) {
  if (!(name in targets)) {
    throw new Error(`Rol desconocido: ${name}. Usa customer, rider, backoffice o walletobserver.`);
  }
}

if (releaseBuild) {
  const requiredSigningVariables = [
    'SUYA_RELEASE_STORE_FILE',
    'SUYA_RELEASE_STORE_PASSWORD',
    'SUYA_RELEASE_KEY_ALIAS',
    'SUYA_RELEASE_KEY_PASSWORD',
  ];
  const missing = requiredSigningVariables.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Para APK release firmada configura: ${missing.join(', ')}.`);
  }
  try {
    await stat(process.env.SUYA_RELEASE_STORE_FILE);
  } catch {
    throw new Error('SUYA_RELEASE_STORE_FILE no señala un keystore disponible.');
  }
}

function run(command, args, env) {
  execFileSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}

await mkdir(outputRoot, { recursive: true });

let nativeTestsRan = false;

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
  if (!nativeTestsRan) {
    console.log('==> Ejecutando regresiones nativas del observador');
    run('bash', ['android/gradlew', '-p', 'android', ':app:test', '--no-daemon'], targetEnv);
    nativeTestsRan = true;
  }
  const gradleTask = `assemble${buildType[0].toUpperCase()}${buildType.slice(1)}`;
  run('bash', ['android/gradlew', '-p', 'android', gradleTask, '--no-daemon'], targetEnv);

  const apk = path.join(repoRoot, 'android', 'app', 'build', 'outputs', 'apk', buildType, `app-${buildType}.apk`);
  const artifact = releaseBuild
    ? `${target.artifactPrefix}-${versionName}-code${versionCode}-release.apk`
    : `${target.artifactPrefix}-${versionName}-code${versionCode}-debug.apk`;
  await cp(apk, path.join(outputRoot, artifact));
  console.log(`APK listo: output/android/${artifact}`);
}

console.log(`\nAPKs ${buildType} generados: ${requested.join(', ')}`);
