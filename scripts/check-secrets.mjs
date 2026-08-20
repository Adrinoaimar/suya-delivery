import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split(/\r?\n/u)
  .filter(Boolean);

const patterns = [
  ['clave privada', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/u],
  ['GitHub token', /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/u],
  ['Stripe secret key', /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/u],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{30,}\b/u],
  ['AWS access key', /\bAKIA[A-Z0-9]{16}\b/u],
];

const findings = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) findings.push(`${file}: posible ${label}`);
  }
}

if (findings.length > 0) {
  console.error('Posibles secretos detectados:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Escaneo local completado: ${files.length} archivos, sin patrones de secreto.`);
