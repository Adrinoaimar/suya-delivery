import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260923120000_wallet_confirmation_safety.sql',
);

describe('autorización de billeteras', () => {
  it('rechaza pago autorizado sin observación y limita intentos del código Yape', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain("new.status = 'authorized'");
    expect(migration).toContain("new.provider = 'wallet_observer'");
    expect(migration).toContain('new.observed_wallet_observation_id is null');
    expect(migration).toContain('private.consume_yape_confirmation_attempt');
    expect(migration).toContain('if v_count > 5 then');
    expect(migration).toContain('after insert or update of code_last4');
    expect(migration).toContain('new.code_last4 is not distinct from old.code_last4');
  });
});
