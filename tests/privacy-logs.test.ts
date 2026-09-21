import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const functionSources = [
  'supabase/functions/charge-culqi-card/index.ts',
  'supabase/functions/create-culqi-order/index.ts',
  'supabase/functions/culqi-webhook/index.ts',
  'supabase/functions/invite-restaurant-owner/index.ts',
].map((path) => readFileSync(path, 'utf8'));

describe('privacidad de logs server-side', () => {
  it('no registra cuerpos crudos de respuestas externas', () => {
    const unsafeLogLines = functionSources
      .flatMap((source) => source.split('\n'))
      .filter((line) => /console\.(?:error|warn|log|info)/.test(line) && /\.text\(\)|\.slice\(/.test(line));

    expect(unsafeLogLines).toEqual([]);
  });
});
