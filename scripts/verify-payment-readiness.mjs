import { readFile } from 'node:fs/promises';

const args = new Set(process.argv.slice(2));
const deployment = args.has('--deployment');
const network = args.has('--network');
const failures = [];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) failures.push(`${name} no está configurada.`);
  return value ?? '';
}

function fail(message) {
  failures.push(message);
}

const config = JSON.parse(await readFile(new URL('../config/production.json', import.meta.url), 'utf8'));
const supabaseUrl = required('VITE_SUPABASE_URL');
const expectedProjectRef = required('VITE_EXPECTED_SUPABASE_PROJECT_REF');
const publishableKey = required('VITE_SUPABASE_PUBLISHABLE_KEY');
const publicCulqiKey = process.env.VITE_CULQI_PUBLIC_KEY?.trim() ?? '';
const gatewayEnabled = required('VITE_CULQI_GATEWAY_ENABLED');
const allowedOrigins = required('ALLOWED_ORIGINS');
const mapProvider = required('VITE_MAP_PROVIDER');

if (process.env.VITE_BACKEND !== 'supabase') fail('VITE_BACKEND debe ser supabase.');
if (!['osm', 'google'].includes(mapProvider)) fail('VITE_MAP_PROVIDER debe ser osm o google.');

const actualProjectRef = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1] ?? '';
if (!actualProjectRef) fail('VITE_SUPABASE_URL debe ser un origen Supabase HTTPS válido.');
if (expectedProjectRef !== config.supabaseProjectRef || actualProjectRef !== config.supabaseProjectRef) {
  fail('Supabase no coincide con el project ref canónico de Suya.');
}
if (!/^sb_(?:publishable|anon)_[A-Za-z0-9_-]+$/.test(publishableKey) && !/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(publishableKey)) {
  fail('VITE_SUPABASE_PUBLISHABLE_KEY no parece una clave pública válida.');
}
if (!['true', 'false'].includes(gatewayEnabled)) {
  fail('VITE_CULQI_GATEWAY_ENABLED debe ser true o false.');
}
if (gatewayEnabled !== 'false' && !publicCulqiKey) {
  fail('VITE_CULQI_PUBLIC_KEY es requerida cuando Culqi está habilitado.');
}
if (publicCulqiKey && !/^pk_(?:test|live)_[A-Za-z0-9_-]+$/.test(publicCulqiKey)) {
  fail('VITE_CULQI_PUBLIC_KEY debe ser pk_test_ o pk_live_; nunca sk_.');
}

const canonicalOrigins = Object.values(config.apps).map((app) => app.origin);
const origins = allowedOrigins.split(',').map((value) => value.trim()).filter(Boolean);
if (new Set(origins).size !== origins.length) fail('ALLOWED_ORIGINS contiene orígenes repetidos.');
if (origins.some((origin) => origin.includes('*'))) fail('ALLOWED_ORIGINS no admite comodines.');
for (const origin of canonicalOrigins) {
  if (!origins.includes(origin)) fail(`ALLOWED_ORIGINS no incluye ${origin}.`);
}

if (deployment) {
  required('SUPABASE_ACCESS_TOKEN');
  required('SUPABASE_DB_PASSWORD');
  const culqiSecretKey = required('CULQI_SECRET_KEY');
  required('SUPABASE_SERVICE_ROLE_KEY');
  required('CULQI_WEBHOOK_USERNAME');
  required('CULQI_WEBHOOK_PASSWORD');
  if (!/^sk_(?:test|live)_[A-Za-z0-9_-]+$/.test(culqiSecretKey)) {
    fail('CULQI_SECRET_KEY debe ser una clave sk_test_ o sk_live_.');
  }
}

async function checkFunction(path, expectedStatuses = [200, 204, 400, 401, 403, 405, 422, 503]) {
  if (!network || !supabaseUrl) return;
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
      method: 'OPTIONS',
      headers: { Origin: config.apps.customer.origin },
      signal: AbortSignal.timeout(8_000),
    });
    if (!expectedStatuses.includes(response.status)) {
      fail(`${path} respondió HTTP ${response.status}; el endpoint podría no estar desplegado.`);
    } else {
      console.log(`${path}: HTTP ${response.status}`);
    }
  } catch (error) {
    fail(`${path} no respondió: ${error instanceof Error ? error.message : 'error de red'}.`);
  }
}

await checkFunction('create-culqi-order');
await checkFunction('charge-culqi-card');
await checkFunction('culqi-webhook');

if (failures.length) {
  console.error('Preflight de pagos no apto:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  network
    ? 'Preflight de pagos válido; endpoints alcanzables. No se ejecutaron cargos ni mutaciones.'
    : 'Preflight de pagos válido; no se ejecutaron cargos, migraciones ni llamadas de red.',
);
