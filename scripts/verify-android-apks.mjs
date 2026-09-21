import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const aapt2Index = args.indexOf('--aapt2');
const aapt2 = aapt2Index >= 0 ? args[aapt2Index + 1] : process.env.AAPT2 || 'aapt2';
const outputDirectory = path.resolve(process.env.SUYA_ANDROID_OUTPUT || 'output/android');
const failures = [];

const expected = [
  { file: 'Suya-Rider-debug.apk', packageName: 'com.suya.rider', label: 'Suya Repartidor' },
  { file: 'Suya-Backoffice-debug.apk', packageName: 'com.suya.backoffice', label: 'Suya Backoffice' },
  { file: 'Suya-Wallet-Observer-debug.apk', packageName: 'com.suya.walletobserver', label: 'Suya' },
];

function fail(message) {
  failures.push(message);
}

function inspectBadging(file) {
  try {
    return execFileSync(aapt2, ['dump', 'badging', file], { encoding: 'utf8' });
  } catch (error) {
    fail(`${path.basename(file)}: no se pudo inspeccionar con aapt2 (${error.message}).`);
    return '';
  }
}

for (const item of expected) {
  const file = path.join(outputDirectory, item.file);
  if (!existsSync(file)) {
    fail(`Falta ${item.file}.`);
    continue;
  }
  if (statSync(file).size < 100_000) fail(`${item.file}: tamaño inesperadamente pequeño.`);

  try {
    execFileSync('unzip', ['-tqq', file], { stdio: 'ignore' });
  } catch (error) {
    fail(`${item.file}: ZIP/APK corrupto (${error.message}).`);
  }

  const badging = inspectBadging(file);
  const packageName = badging.match(/package: name='([^']+)'/)?.[1];
  const label = badging.match(/application-label(?:-es)?:'([^']+)'/)?.[1];
  if (packageName !== item.packageName) {
    fail(`${item.file}: package ID ${packageName || 'ausente'}; esperado ${item.packageName}.`);
  }
  if (label !== item.label) {
    fail(`${item.file}: etiqueta ${label || 'ausente'}; esperada ${item.label}.`);
  }
  if (!/launchable-activity: name='[^']+'/u.test(badging)) {
    fail(`${item.file}: no contiene una actividad lanzable.`);
  }
  if (!/versionCode='6'\s+versionName='1\.5'/u.test(badging)) {
    fail(`${item.file}: versión nativa inesperada; se esperaba 6/1.5.`);
  }
  for (const forbidden of ['android.permission.READ_SMS', 'android.permission.RECEIVE_SMS', 'android.permission.SYSTEM_ALERT_WINDOW']) {
    if (badging.includes(`uses-permission: name='${forbidden}'`)) {
      fail(`${item.file}: permiso sensible no permitido: ${forbidden}.`);
    }
  }
}

if (failures.length) {
  console.error('Auditoría de APKs no apta:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Auditoría de APKs válida: ${expected.map((item) => item.packageName).join(', ')}.`);
