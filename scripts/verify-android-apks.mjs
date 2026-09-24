import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const aapt2Index = args.indexOf('--aapt2');
const aapt2 = aapt2Index >= 0 ? args[aapt2Index + 1] : process.env.AAPT2 || 'aapt2';
const apksignerIndex = args.indexOf('--apksigner');
const apksigner = apksignerIndex >= 0 ? args[apksignerIndex + 1] : process.env.APKSIGNER || 'apksigner';
const releaseBuild = args.includes('--release');
const expectedCertificateIndex = args.indexOf('--expected-cert-sha256');
const expectedCertificate = expectedCertificateIndex >= 0 ? args[expectedCertificateIndex + 1]?.toLowerCase() : null;
const outputDirectory = path.resolve(process.env.SUYA_ANDROID_OUTPUT || 'output/android');
const failures = [];
const signerDigests = [];
const versionPattern = /versionCode='9'\s+versionName='1\.8'/u;

const expected = [
  {
    artifactPrefix: 'Suya-Cliente',
    packageName: 'com.suya.app',
    label: 'Suya Cliente',
    observerEnabled: false,
  },
  {
    artifactPrefix: 'Suya-Rider',
    packageName: 'com.suya.rider',
    label: 'Suya Repartidor',
    observerEnabled: false,
  },
  {
    artifactPrefix: 'Suya-Backoffice',
    packageName: 'com.suya.backoffice',
    label: 'Suya Backoffice',
    observerEnabled: false,
  },
  {
    artifactPrefix: 'Suya-Wallet-Observer',
    packageName: 'com.suya.walletobserver',
    label: 'Suya Caja',
    observerEnabled: true,
  },
];

const suffix = releaseBuild ? '-1.8-code9-release.apk' : '-1.8-code9-debug.apk';

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

function inspectManifest(file) {
  try {
    return execFileSync(aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', file], {
      encoding: 'utf8',
    });
  } catch (error) {
    fail(`${path.basename(file)}: no se pudo inspeccionar el manifiesto (${error.message}).`);
    return '';
  }
}

function serviceEnabled(manifest, serviceName) {
  const escaped = serviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = manifest.match(
    new RegExp(
      `E: service[\\s\\S]*?android:name[^\\n]*="${escaped}"[\\s\\S]*?android:enabled[^=]*=(true|false)`,
      'u',
    ),
  );
  return match?.[1] === 'true';
}

for (const item of expected) {
  const fileName = `${item.artifactPrefix}${suffix}`;
  const file = path.join(outputDirectory, fileName);
  if (!existsSync(file)) {
    fail(`Falta ${fileName}.`);
    continue;
  }
  if (statSync(file).size < 100_000) fail(`${fileName}: tamaño inesperadamente pequeño.`);

  try {
    execFileSync('unzip', ['-tqq', file], { stdio: 'ignore' });
  } catch (error) {
    fail(`${fileName}: ZIP/APK corrupto (${error.message}).`);
  }

  const badging = inspectBadging(file);
  const manifest = inspectManifest(file);
  const packageName = badging.match(/package: name='([^']+)'/)?.[1];
  const label = badging.match(/application-label(?:-es)?:'([^']+)'/)?.[1];
  if (packageName !== item.packageName) {
    fail(`${fileName}: package ID ${packageName || 'ausente'}; esperado ${item.packageName}.`);
  }
  if (label !== item.label) {
    fail(`${fileName}: etiqueta ${label || 'ausente'}; esperada ${item.label}.`);
  }
  if (!/launchable-activity: name='[^']+'/u.test(badging)) {
    fail(`${fileName}: no contiene una actividad lanzable.`);
  }
  if (!versionPattern.test(badging)) {
    fail(`${fileName}: versión nativa inesperada; se esperaba 9/1.8.`);
  }
  if (releaseBuild && /application-debuggable/u.test(badging)) {
    fail(`${fileName}: un APK release no puede ser depurable.`);
  }

  try {
    const signature = execFileSync(apksigner, ['verify', '--verbose', '--print-certs', file], {
      encoding: 'utf8',
    });
    const digests = [...signature.matchAll(/Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})/giu)]
      .map((match) => match[1].toLowerCase());
    if (digests.length === 0) fail(`${fileName}: no tiene una firma Android válida.`);
    if (releaseBuild && digests.length !== 1) fail(`${fileName}: se esperaba exactamente un firmante release.`);
    if (expectedCertificate && digests[0] !== expectedCertificate) {
      fail(`${fileName}: la firma no coincide con el certificado de la versión instalada.`);
    }
    if (digests[0]) signerDigests.push(digests[0]);
  } catch (error) {
    fail(`${fileName}: apksigner no pudo validar la firma (${error.message}).`);
  }
  const listenerEnabled = serviceEnabled(manifest, 'com.suya.app.YapeNotificationListenerService');
  const syncEnabled = serviceEnabled(manifest, 'com.suya.app.SuyaWalletSyncJobService');
  if (listenerEnabled !== item.observerEnabled || syncEnabled !== item.observerEnabled) {
    fail(
      `${fileName}: servicios del observador inesperados (listener=${listenerEnabled}, sync=${syncEnabled}; esperado=${item.observerEnabled}).`,
    );
  }
  for (const forbidden of ['android.permission.READ_SMS', 'android.permission.RECEIVE_SMS', 'android.permission.SYSTEM_ALERT_WINDOW']) {
    if (badging.includes(`uses-permission: name='${forbidden}'`)) {
      fail(`${fileName}: permiso sensible no permitido: ${forbidden}.`);
    }
  }
}

if (signerDigests.length === expected.length && new Set(signerDigests).size !== 1) {
  fail('Los cuatro APK no comparten el mismo certificado.');
}

if (failures.length) {
  console.error('Auditoría de APKs no apta:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Auditoría de APKs válida: ${expected.map((item) => item.packageName).join(', ')}.`);
