import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const excludedDirectories = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.npm-cache',
  '.playwright-browsers',
  '.playwright-cli',
  '.playwright-daemon',
  '.playwright-local',
  '.supabase',
  '.xdg',
  'build',
  'coverage',
  'node_modules',
  'output',
]);

function listFilesWithoutGit(root = '.') {
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (
        entry.isDirectory() &&
        (excludedDirectories.has(entry.name) || entry.name === 'dist' || entry.name.startsWith('dist-'))
      ) {
        continue;
      }

      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  }

  visit(root);
  return files;
}

function listFiles() {
  try {
    return {
      files: execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .split(/\r?\n/u)
        .filter(Boolean),
      source: 'Git',
    };
  } catch {
    return { files: listFilesWithoutGit(), source: 'filesystem fallback' };
  }
}

const { files, source } = listFiles();

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
    const buffer = readFileSync(file);
    if (buffer.includes(0)) continue;
    content = buffer.toString('utf8');
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

console.log(`Escaneo local completado (${source}): ${files.length} archivos, sin patrones de secreto.`);
