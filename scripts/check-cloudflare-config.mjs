import { readFile } from 'node:fs/promises';
import { isSafeSupabasePublishableKey } from './lib/public-supabase-key.mjs';

const args = new Set(process.argv.slice(2));
const projectFileIndex = process.argv.indexOf('--projects');
const projectFile = projectFileIndex >= 0 ? process.argv[projectFileIndex + 1] : undefined;
const canonicalPath = process.env.SUYA_PRODUCTION_CONFIG || 'config/production.json';
const failures = [];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) failures.push(`${name} no está configurada.`);
  return value;
}

function deploymentUrl(name) {
  const value = required(name);
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    ) {
      failures.push(
        `${name} debe ser un origen HTTPS exacto, sin ruta, credenciales, query ni hash.`,
      );
    }
    if (/(?:^|\.)example(?:\.|$)/i.test(parsed.hostname)) {
      failures.push(`${name} todavía usa un dominio de ejemplo.`);
    }
    return parsed.origin;
  } catch {
    failures.push(`${name} no es una URL válida.`);
  }
}

let canonical;
try {
  canonical = JSON.parse(await readFile(canonicalPath, 'utf8'));
} catch (error) {
  failures.push(`No se pudo leer la configuración productiva canónica: ${error.message}`);
}

const canonicalRef = canonical?.supabaseProjectRef;
if (!canonicalRef || canonicalRef === 'PROJECT_REF') {
  failures.push('config/production.json aún no fija el project ref Supabase real de Suya.');
}

const supabaseUrl = required('VITE_SUPABASE_URL');
const expectedRef = required('VITE_EXPECTED_SUPABASE_PROJECT_REF');
const publishableKey = required('VITE_SUPABASE_PUBLISHABLE_KEY');
if (publishableKey && !isSafeSupabasePublishableKey(publishableKey)) {
  failures.push('VITE_SUPABASE_PUBLISHABLE_KEY no es una clave pública anon/publishable válida.');
}

const actualRef = supabaseUrl?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1];
if (!actualRef) failures.push('VITE_SUPABASE_URL debe ser un origen Supabase válido.');
if (canonicalRef && (actualRef !== canonicalRef || expectedRef !== canonicalRef)) {
  failures.push('Supabase no coincide con el project ref canónico versionado de Suya.');
}

const envByApp = {
  customer: {
    origin: deploymentUrl('VITE_CUSTOMER_APP_URL'),
    project: process.env.CLOUDFLARE_CUSTOMER_PROJECT?.trim() || 'suya-customer',
  },
  rider: {
    origin: deploymentUrl('VITE_RIDER_APP_URL'),
    project: process.env.CLOUDFLARE_RIDER_PROJECT?.trim() || 'suya-rider',
  },
  backoffice: {
    origin: deploymentUrl('VITE_BACKOFFICE_APP_URL'),
    project: process.env.CLOUDFLARE_BACKOFFICE_PROJECT?.trim() || 'suya-backoffice',
  },
};

for (const [app, value] of Object.entries(envByApp)) {
  const expected = canonical?.apps?.[app];
  if (!expected?.origin || !expected?.cloudflareProject) {
    failures.push(`config/production.json no define ${app}.`);
    continue;
  }
  if (value.origin !== expected.origin || value.project !== expected.cloudflareProject) {
    failures.push(`${app} no coincide con su origen/proyecto Cloudflare canónico.`);
  }
}

const appUrls = Object.values(envByApp)
  .map((app) => app.origin)
  .filter(Boolean);
const projects = Object.values(envByApp).map((app) => app.project);
if (new Set(appUrls).size !== appUrls.length)
  failures.push('Las tres apps deben usar orígenes distintos.');
if (new Set(projects).size !== projects.length)
  failures.push('Los tres proyectos Pages deben ser distintos.');

if (args.has('--deployment')) {
  required('CLOUDFLARE_ACCOUNT_ID');
  required('CLOUDFLARE_API_TOKEN');
}

if (projectFile) {
  try {
    const payload = JSON.parse(await readFile(projectFile, 'utf8'));
    const rows = Array.isArray(payload) ? payload : payload.result;
    const names = new Set((Array.isArray(rows) ? rows : []).map((project) => project.name));
    for (const name of projects) {
      if (!names.has(name))
        failures.push(`El proyecto Pages ${name} no existe en la cuenta autorizada.`);
    }
  } catch (error) {
    failures.push(`No se pudo validar la lista de proyectos Pages: ${error.message}`);
  }
}

if (failures.length) {
  console.error('Configuración Cloudflare no apta:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Configuración Cloudflare válida para ${projects.join(', ')}.`);
