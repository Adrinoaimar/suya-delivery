import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const backend = process.env.VITE_BACKEND;
const mapProvider = process.env.VITE_MAP_PROVIDER;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const expectedProjectRef = process.env.VITE_EXPECTED_SUPABASE_PROJECT_REF;
const failures = [];

if (backend !== 'supabase') failures.push('VITE_BACKEND debe ser supabase.');
const actualProjectRef = supabaseUrl?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1];
if (!actualProjectRef) failures.push('VITE_SUPABASE_URL debe ser una URL Supabase válida.');
if (!expectedProjectRef || expectedProjectRef === 'PROJECT_REF') {
  failures.push('VITE_EXPECTED_SUPABASE_PROJECT_REF debe identificar el proyecto exclusivo de Suya.');
} else if (actualProjectRef !== expectedProjectRef) {
  failures.push('La URL Supabase no coincide con el project ref exclusivo esperado.');
}
if (!supabaseKey || !/^(?:sb_publishable_|eyJ)/.test(supabaseKey) || /REPLACE_ME/.test(supabaseKey)) {
  failures.push('VITE_SUPABASE_PUBLISHABLE_KEY debe ser una clave pública válida.');
}
if (!mapProvider || mapProvider === 'mock') {
  failures.push('VITE_MAP_PROVIDER debe seleccionar un proveedor real.');
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk('dist');
const forbiddenNames = /(?:MockMap|DemoNotice|MockOrderService|MockPaymentService|MockStoreService)/iu;
const forbiddenContent = [
  /DEMO LOCAL/iu,
  /DEMO DATA/iu,
  /SIMULATION_STEPS/u,
  /\bsb_secret_/u,
  /\bservice_role\b/u,
];

for (const file of files) {
  if (extname(file) === '.map') failures.push(`${file}: sourcemap productivo no permitido.`);
  if (forbiddenNames.test(file)) failures.push(`${file}: artefacto simulado incluido.`);

  if (!['.js', '.css', '.html', '.json', '.webmanifest'].includes(extname(file))) continue;
  const content = readFileSync(file, 'utf8');
  for (const pattern of forbiddenContent) {
    if (pattern.test(content)) failures.push(`${file}: contiene ${pattern}.`);
  }
}

if (failures.length > 0) {
  console.error('Build no apto para producción:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Build productivo validado: ${files.length} archivos, sin simulaciones ni secretos.`);
