import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const createOrderSource = readFileSync('supabase/functions/create-culqi-order/index.ts', 'utf8');
const chargeCardSource = readFileSync('supabase/functions/charge-culqi-card/index.ts', 'utf8');

describe('contrato de RPC Culqi opcional', () => {
  it('usa únicamente wrappers seguros desde las Edge Functions', () => {
    const sources = [createOrderSource, chargeCardSource];
    const secureRpcNames = [
      'create_culqi_payment_intent_secure',
      'claim_culqi_order_creation_secure',
      'claim_culqi_payment_secure',
      'fail_culqi_payment_claim_secure',
      'authorize_culqi_payment_secure',
    ];

    for (const name of secureRpcNames) {
      expect(sources.some((source) => source.includes(`/rpc/${name}`))).toBe(true);
    }

    expect(sources.join('\n')).not.toMatch(
      /\/rpc\/(?:create_culqi_payment_intent|claim_culqi_order_creation|claim_culqi_payment|fail_culqi_payment_claim|authorize_culqi_payment)(?:["'`]|\b)/,
    );
  });
});
