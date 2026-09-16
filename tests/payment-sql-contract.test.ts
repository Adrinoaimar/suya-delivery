import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260916150000_receiver_restaurant_binding_read_guard.sql'),
  'utf8',
);
const receiverReuseGuardMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260916160000_receiver_restaurant_reuse_guard.sql'),
  'utf8',
);
const hmacMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260916110000_context_bound_payment_evidence_hmac.sql'),
  'utf8',
);
const cashMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915130000_cash_register_closing.sql'),
  'utf8',
);

const createStart = migration.indexOf('create or replace function public.create_payment_intent(');
const refreshStart = migration.indexOf('create or replace function public.refresh_payment_intent(');
const createSource = migration.slice(createStart, refreshStart);
const fixedCreateStart = receiverReuseGuardMigration.indexOf('create or replace function public.create_payment_intent(');
const fixedCreateSource = receiverReuseGuardMigration.slice(fixedCreateStart);

describe('contrato SQL de intención wallet', () => {
  it('mantiene diez columnas en todas las ramas de create_payment_intent', () => {
    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(refreshStart).toBeGreaterThan(createStart);
    expect(createSource).not.toContain(
      'v_attempt.provider, v_attempt.provider_reference, v_qr_payload',
    );
    expect(createSource.match(/v_attempt\.provider, v_qr_payload/g)).toHaveLength(2);
  });

  it('no reutiliza una cuenta activa de otro restaurante', () => {
    expect(fixedCreateStart).toBeGreaterThanOrEqual(0);
    expect(fixedCreateSource).toContain(
      'where rpa.id = v_attempt.receiver_account_id\n'
        + '        and rpa.restaurant_id = v_order.restaurant_id\n'
        + '        and rpa.active;',
    );
  });

  it('usa el mismo contexto para comparar declaración, observación y corrección', () => {
    expect(hmacMigration.match(/concat_ws\('\|',\s*'payment-code',/g)).toHaveLength(3);
    expect(hmacMigration).not.toMatch(/'payment-claim'|'wallet-observation'/);
  });

  it('mantiene una sola declaración del actor en el registro de venta cash', () => {
    const saleStart = cashMigration.indexOf('create function public.record_cash_sale(');
    const adjustmentStart = cashMigration.indexOf('create function public.add_cash_adjustment(');
    const saleSource = cashMigration.slice(saleStart, adjustmentStart);

    expect(saleStart).toBeGreaterThanOrEqual(0);
    expect(adjustmentStart).toBeGreaterThan(saleStart);
    expect(saleSource.match(/actor_id uuid := \(select auth\.uid\(\)\);/g)).toHaveLength(1);
  });
});
