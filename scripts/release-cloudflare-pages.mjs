import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const sha = process.env.GITHUB_SHA?.trim();
const allowInitialRelease = process.env.SUYA_ALLOW_INITIAL_RELEASE === 'true';

if (!accountId || !apiToken || !sha) {
  throw new Error('Faltan CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN o GITHUB_SHA.');
}

const config = JSON.parse(await readFile('config/production.json', 'utf8'));
const appOrder = ['backoffice', 'rider', 'customer'];
const candidateBranch = `candidate-${sha.slice(0, 12).toLowerCase()}`;
const snapshots = new Map();
const published = [];

function apiUrl(project, suffix = '') {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}/deployments${suffix}`;
}

async function cloudflare(project, suffix = '', options = {}) {
  const response = await fetch(apiUrl(project, suffix), {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(`Cloudflare API rechazó ${project} (${response.status}).`);
  }
  return payload.result;
}

async function latestProduction(project) {
  const deployments = await cloudflare(project, '?env=production&per_page=25');
  return deployments.find(
    (deployment) =>
      deployment.environment === 'production' && deployment.latest_stage?.status === 'success',
  );
}

function deploy(app, branch) {
  const project = config.apps[app].cloudflareProject;
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        '--yes',
        'wrangler@4.123.0',
        'pages',
        'deploy',
        `dist/${app}`,
        `--project-name=${project}`,
        `--branch=${branch}`,
        `--commit-hash=${sha}`,
        '--commit-dirty=false',
      ],
      { env: process.env, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`Falló deploy ${app} (${code}).`)),
    );
  });
}

async function smoke(origin, path) {
  const targets = [origin, new URL(path, origin).href];
  for (const target of targets) {
    let lastStatus;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const response = await fetch(target, { redirect: 'follow' });
        lastStatus = response.status;
        if (response.ok && (response.headers.get('content-type') || '').includes('text/html'))
          break;
      } catch {
        lastStatus = 'sin conexión';
      }
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    if (lastStatus !== 200) throw new Error(`Smoke falló en ${target}: ${lastStatus}.`);
  }
}

async function rollback() {
  const failures = [];
  for (const app of [...published].reverse()) {
    const project = config.apps[app].cloudflareProject;
    const snapshot = snapshots.get(app);
    if (!snapshot) continue;
    try {
      await cloudflare(project, `/${encodeURIComponent(snapshot.id)}/rollback`, { method: 'POST' });
      console.log(`Rollback confirmado: ${app} -> ${snapshot.short_id || snapshot.id}.`);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Uno o más rollbacks fallaron.');
}

for (const app of appOrder) {
  const project = config.apps[app].cloudflareProject;
  const previous = await latestProduction(project);
  if (!previous && !allowInitialRelease) {
    throw new Error(
      `${project} no tiene release productivo previo. Usa SUYA_ALLOW_INITIAL_RELEASE=true solo para la primera publicación consciente.`,
    );
  }
  snapshots.set(app, previous);
}

for (const app of appOrder) await deploy(app, candidateBranch);
for (const app of appOrder) {
  const project = config.apps[app].cloudflareProject;
  await smoke(`https://${candidateBranch}.${project}.pages.dev`, config.apps[app].smokePath);
}

try {
  for (const app of appOrder) {
    await deploy(app, 'main');
    published.push(app);
  }
  for (const app of appOrder) {
    await smoke(config.apps[app].origin, config.apps[app].smokePath);
  }
} catch (error) {
  try {
    await rollback();
  } catch (rollbackError) {
    throw new AggregateError([error, rollbackError], 'Falló la release y su rollback.');
  }
  throw error;
}

console.log(`Release Cloudflare completa para commit ${sha}.`);
