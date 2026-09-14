import { describe, expect, it } from 'vitest';
import { parseYapeNotification } from '@/lib/payments/yapeNotificationParser';

describe('parseYapeNotification', () => {
  it('extracts a Yape amount and security code without trusting the event', () => {
    const result = parseYapeNotification({
      packageName: 'com.bcp.innovacxion.yapeapp',
      title: 'Yape',
      text: 'Recibiste S/ 25.50. Código de seguridad: 482',
      postedAt: '2026-09-06T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      amountCents: 2550,
      currency: 'PEN',
      senderName: null,
      code: '482',
      verification: 'unverified',
    });
    expect(result?.fingerprint).toMatch(/^yape-/);
  });

  it('normalizes thousands separators and operation codes', () => {
    const result = parseYapeNotification({
      packageName: 'com.bcp.yape.app',
      title: 'Yape recibido',
      text: 'Se recibió S/ 1,250.00 · Operación: 987654321',
      postedAt: '2026-09-06T12:00:00.000Z',
    });

    expect(result).toMatchObject({ amountCents: 125000, code: '987654321' });
  });

  it('captures the visible sender when the wallet notification includes it', () => {
    const result = parseYapeNotification({
      packageName: 'com.bcp.innovacxion.yapeapp',
      title: 'Yape',
      text: 'Recibiste S/ 30.00 de Ana María Torres',
      postedAt: '2026-09-06T12:00:00.000Z',
    });

    expect(result).toMatchObject({ amountCents: 3000, senderName: 'Ana María Torres' });
  });

  it('ignores other apps and messages without a monetary amount', () => {
    expect(parseYapeNotification({ packageName: 'com.example.fake', text: 'Recibiste S/ 20.00' })).toBeNull();
    expect(parseYapeNotification({ packageName: 'com.bcp.innovacxion.yapeapp', text: 'Yape listo' })).toBeNull();
  });
});
