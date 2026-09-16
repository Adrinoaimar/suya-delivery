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

  it('does not truncate an ungrouped four-digit amount', () => {
    const result = parseYapeNotification({
      packageName: 'com.bcp.yape.app',
      title: 'Yape recibido',
      text: 'Recibiste S/ 1000.00',
      postedAt: '2026-09-06T12:00:00.000Z',
    });

    expect(result).toMatchObject({ amountCents: 100000, currency: 'PEN' });
  });

  it('does not treat a negative amount as an incoming payment', () => {
    const result = parseYapeNotification({
      packageName: 'com.bcp.yape.app',
      title: 'Yape recibido',
      text: 'Reversión -S/ 30.00',
      postedAt: '2026-09-06T12:00:00.000Z',
    });

    expect(result).toBeNull();
  });

  it('uses the stable notification key to separate same-time equal payments', () => {
    const input = {
      packageName: 'com.bcp.yape.app',
      title: 'Yape recibido',
      text: 'Recibiste S/ 30.00',
      postedAt: '2026-09-06T12:00:00.000Z',
    };

    const first = parseYapeNotification({ ...input, notificationKey: 'notification-1' });
    const second = parseYapeNotification({ ...input, notificationKey: 'notification-2' });

    expect(first?.fingerprint).not.toBe(second?.fingerprint);
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

  it('captures the sender when Yape places the name before the verb', () => {
    const result = parseYapeNotification({
      packageName: 'com.bcp.innovacxion.yapeapp',
      title: 'Ana María Torres',
      text: 'te envió S/ 30.00',
      infoText: 'Yape',
      postedAt: '2026-09-06T12:00:00.000Z',
    });

    expect(result).toMatchObject({ amountCents: 3000, senderName: 'Ana María Torres' });
  });

  it('captures sender labels with punctuation without swallowing the operation code', () => {
    const result = parseYapeNotification({
      packageName: 'com.bcp.innovacxion.yapeapp',
      title: 'Yape',
      text: 'Recibiste S/ 30.00. De: Ana María Torres. Código de operación: 482901',
      postedAt: '2026-09-06T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      amountCents: 3000,
      senderName: 'Ana María Torres',
      code: '482901',
    });
  });

  it('reads an identifier placed in a secondary notification field', () => {
    const result = parseYapeNotification({
      packageName: 'com.bcp.innovacxion.yapeapp',
      title: 'Yape recibido',
      text: 'Recibiste S/ 30.00',
      subText: 'Código de operación: 842911',
      postedAt: '2026-09-06T12:00:00.000Z',
    });

    expect(result).toMatchObject({ amountCents: 3000, code: '842911' });
  });

  it('ignores other apps and messages without a monetary amount', () => {
    expect(parseYapeNotification({ packageName: 'com.example.fake', text: 'Recibiste S/ 20.00' })).toBeNull();
    expect(parseYapeNotification({ packageName: 'com.bcp.innovacxion.yapeapp', text: 'Yape listo' })).toBeNull();
  });
});
