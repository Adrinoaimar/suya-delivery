import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const backend = process.env.VITE_BACKEND;
const mapProvider = process.env.VITE_MAP_PROVIDER;
const failures = [];

if (backend !== 'supabase') failures.push('VITE_BACKEND debe ser supabase.');
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
