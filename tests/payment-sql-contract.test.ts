import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260916150000_receiver_restaurant_binding_read_guard.sql'),
  'utf8',
);
const hmacMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260916110000_context_bound_payment_evidence_hmac.sql'),
  'utf8',
);

const createStart = migration.indexOf('create or replace function public.create_payment_intent(');
const refreshStart = migration.indexOf('create or replace function public.refresh_payment_intent(');
const createSource = migration.slice(createStart, refreshStart);

describe('contrato SQL de intención wallet', () => {
  it('mantiene diez columnas en todas las ramas de create_payment_intent', () => {
    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(refreshStart).toBeGreaterThan(createStart);
    expect(createSource).not.toContain(
      'v_attempt.provider, v_attempt.provider_reference, v_qr_payload',
    );
    expect(createSource.match(/v_attempt\.provider, v_qr_payload/g)).toHaveLength(2);
  });

  it('usa el mismo contexto para comparar declaración, observación y corrección', () => {
    expect(hmacMigration.match(/concat_ws\('\|',\s*'payment-code',/g)).toHaveLength(3);
    expect(hmacMigration).not.toMatch(/'payment-claim'|'wallet-observation'/);
  });
});
