/// <reference types="node" />

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const script = path.resolve('scripts/check-cloudflare-config.mjs');
const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'suya-config-'));
const canonicalConfig = path.join(fixtureDirectory, 'production.json');
writeFileSync(
  canonicalConfig,
  JSON.stringify({
    supabaseProjectRef: 'abcdefghijklmnopqrst',
    apps: {
      customer: {
        cloudflareProject: 'suya-customer',
        origin: 'https://suya-customer.pages.dev',
      },
      rider: {
        cloudflareProject: 'suya-rider',
        origin: 'https://suya-rider.pages.dev',
      },
      backoffice: {
        cloudflareProject: 'suya-backoffice',
        origin: 'https://suya-backoffice.pages.dev',
      },
    },
  }),
);
afterAll(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

const validEnv = {
  ...process.env,
  SUYA_PRODUCTION_CONFIG: canonicalConfig,
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_EXPECTED_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_12345678901234567890',
  VITE_CUSTOMER_APP_URL: 'https://suya-customer.pages.dev',
  VITE_RIDER_APP_URL: 'https://suya-rider.pages.dev',
  VITE_BACKOFFICE_APP_URL: 'https://suya-backoffice.pages.dev',
};

function run(args: string[] = [], env: NodeJS.ProcessEnv = validEnv) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [script, ...args], { env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    },
  );
}

describe('configuración Cloudflare productiva', () => {
  it('acepta tres orígenes y un Supabase exclusivo coherentes', async () => {
    expect((await run()).status).toBe(0);
  });

  it('rechaza project ref cruzado sin filtrar la clave', async () => {
    const result = await run([], {
      ...validEnv,
      VITE_EXPECTED_SUPABASE_PROJECT_REF: 'otroproyecto',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('project ref canónico');
    expect(result.stderr).not.toContain(validEnv.VITE_SUPABASE_PUBLISHABLE_KEY);
  });

  it('rechaza JWT legacy service_role aunque parezca clave Supabase', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    const key = `${header}.${payload}.firma`;
    const result = await run([], { ...validEnv, VITE_SUPABASE_PUBLISHABLE_KEY: key });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('anon/publishable');
    expect(result.stderr).not.toContain(key);
  });

  it('rechaza URLs de ejemplo o repetidas', async () => {
    const result = await run([], {
      ...validEnv,
      VITE_CUSTOMER_APP_URL: 'https://customer.example.pages.dev',
      VITE_RIDER_APP_URL: validEnv.VITE_BACKOFFICE_APP_URL,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dominio de ejemplo');
    expect(result.stderr).toContain('orígenes distintos');
  });

  it('rechaza URLs válidas pero permutadas entre aplicaciones', async () => {
    const result = await run([], {
      ...validEnv,
      VITE_CUSTOMER_APP_URL: validEnv.VITE_RIDER_APP_URL,
      VITE_RIDER_APP_URL: validEnv.VITE_CUSTOMER_APP_URL,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('customer no coincide');
    expect(result.stderr).toContain('rider no coincide');
  });

  it('exige credenciales solamente al solicitar despliegue', async () => {
    const result = await run(['--deployment']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(result.stderr).toContain('CLOUDFLARE_API_TOKEN');
  });

  it('confirma que los tres proyectos existan antes de publicar', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'suya-pages-'));
    const projects = path.join(directory, 'projects.json');
    writeFileSync(projects, JSON.stringify([{ name: 'suya-customer' }, { name: 'suya-rider' }]));
    try {
      const result = await run(['--projects', projects]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('suya-backoffice no existe');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
