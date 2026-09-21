import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webhook = readFileSync(join(process.cwd(), 'supabase/functions/culqi-webhook/index.ts'), 'utf8');

describe('webhook Culqi', () => {
  it('reintenta cuando falla la persistencia del estado', () => {
    expect(webhook).toContain('Payment attempt webhook update failed');
    expect(webhook).toContain("return json({ error: 'No se pudo registrar la autorización Culqi.' }, 502)");
    expect(webhook).toContain("return json({ error: 'No se pudo registrar el estado final de Culqi.' }, 502)");
  });

  it('actualiza la marca de modificación y limpia un fallo al autorizar', () => {
    expect(webhook).toContain("updated_at: new Date().toISOString()");
    expect(webhook).toContain("failure_code: null");
  });

  it('exige autenticación Basic antes de procesar eventos', () => {
    expect(webhook).toContain("Deno.env.get('CULQI_WEBHOOK_USERNAME')");
    expect(webhook).toContain("Deno.env.get('CULQI_WEBHOOK_PASSWORD')");
    expect(webhook).toContain("request.headers.get('authorization')");
    expect(webhook).toContain("'WWW-Authenticate': 'Basic realm=\"suya-culqi-webhook\"'");
    expect(webhook).toContain('if (!hasValidBasicAuth(request, webhookUsername, webhookPassword)) return unauthorized();');
  });
});
