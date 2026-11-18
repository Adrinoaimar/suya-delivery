import { describe, expect, it, vi } from 'vitest';
import { reconcilePayments } from '../scripts/reconcile-payments.mjs';

const endpoint = 'https://cggxooilzhqlcnofgtmi.supabase.co/functions/v1/payment-gateway';
const token = 'local_schedule_secret_only_32_characters';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe('proceso programado de conciliación (HTTP controlado local)', () => {
  it('envía solo la acción y autentica sin poner secretos en URL', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`);
      expect(init?.body).toBe('{"action":"reconcile"}');
      expect(init?.redirect).toBe('error');
      return json({ processed: 3, failed: 0, deferred: 0 });
    });
    await expect(reconcilePayments({ endpoint, token, fetcher })).resolves.toEqual({ processed: 3, failed: 0, deferred: 0 });
  });
  it('reintenta red y 5xx de forma acotada', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ processed: 1, failed: 0 }));
    const delay = vi.fn(async () => undefined);
    await expect(reconcilePayments({ endpoint, token, fetcher, delay })).resolves.toMatchObject({ processed: 1, failed: 0 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
  });
  it('no oculta una conciliación parcial aunque HTTP207 sea 2xx', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ processed: 1, failed: 1, deferred: 0 }, 207));
    await expect(reconcilePayments({ endpoint, token, fetcher })).rejects.toThrow('incompleta');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('no presenta pendientes diferidos o failed en HTTP200 como éxito', async () => {
    await expect(reconcilePayments({ endpoint, token, fetcher: async () => json({ processed: 1, failed: 0, deferred: 2 }) })).rejects.toThrow('incompleta');
    await expect(reconcilePayments({ endpoint, token, fetcher: async () => json({ processed: 1, failed: 1 }) })).rejects.toThrow('incompleta');
  });
  it('no reintenta permisos incorrectos y nunca imprime el body del servidor', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ secret: token }, 401));
    await expect(reconcilePayments({ endpoint, token, fetcher })).rejects.toThrow('HTTP 401');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rechaza URL ajena, transporte inseguro, credencial faltante y resumen inválido', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ processed: '3', failed: 0 }));
    await expect(reconcilePayments({ endpoint: 'https://attacker.test/', token, fetcher })).rejects.toThrow('HTTPS de Supabase');
    await expect(reconcilePayments({ endpoint: endpoint.replace('https:', 'http:'), token, fetcher })).rejects.toThrow('HTTPS de Supabase');
    await expect(reconcilePayments({ endpoint, token: undefined, fetcher })).rejects.toThrow('al menos 32');
    await expect(reconcilePayments({ endpoint, token, fetcher })).rejects.toThrow('resumen inválido');
  });
  it('agota los reintentos con error visible sin repetir indefinidamente', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({}, 503));
    await expect(reconcilePayments({ endpoint, token, fetcher, delay: async () => undefined })).rejects.toThrow('HTTP 503');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
