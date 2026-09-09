import { describe, expect, it } from 'vitest';
import {
  createGenericWalletNotificationAdapter,
  LEMON_NOTIFICATION_ADAPTER,
  parseWalletNotification,
  PLIN_NOTIFICATION_ADAPTER,
} from '@/lib/payments/walletNotificationAdapters';

describe('wallet notification adapters', () => {
  it('parses verified Lemon package with PEN amount and operation reference', () => {
    const result = parseWalletNotification({
      packageName: 'com.applemoncash',
      title: 'Lemon',
      text: 'Recibiste S/ 35.90. Operación: LEMON-482',
      postedAt: '2026-09-06T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      provider: 'lemon',
      source: 'lemon_notification',
      amountCents: 3590,
      currency: 'PEN',
      code: 'LEMON-482',
      verification: 'unverified',
    });
  });

  it('keeps Lemon USD observations unverified', () => {
    const result = parseWalletNotification({
      packageName: 'com.applemoncash',
      title: 'Lemon received',
      text: 'You received US$ 1,250.00. Reference: 123456',
    });

    expect(result).toMatchObject({ provider: 'lemon', amountCents: 125000, currency: 'USD', code: '123456' });
    expect(result?.verification).toBe('unverified');
  });

  it('rejects unverified package IDs even when message says Lemon', () => {
    expect(
      parseWalletNotification({ packageName: 'com.example.lemon', text: 'Lemon recibiste S/ 10.00' }),
    ).toBeNull();
  });

  it('parses Plin only from an explicitly allowlisted bank package', () => {
    const result = parseWalletNotification({
      packageName: 'com.bbva.nxt_peru',
      title: 'Plin',
      text: 'Recibiste S/ 18.00',
    });

    expect(result).toMatchObject({ provider: 'plin', amountCents: 1800, currency: 'PEN' });
    expect(PLIN_NOTIFICATION_ADAPTER.packageNames).toContain('pe.com.interbank.mobilebanking');
  });

  it('parses Mercado Pago PEN observations without promoting them to confirmed payments', () => {
    const result = parseWalletNotification({
      packageName: 'com.mercadopago.wallet',
      title: 'Mercado Pago',
      text: 'Recibiste S/ 22.50. Referencia: MP-123',
    });

    expect(result).toMatchObject({ provider: 'mercado_pago', amountCents: 2250, currency: 'PEN', code: 'MP-123' });
    expect(result?.verification).toBe('unverified');
  });

  it('supports future wallets only through explicit package allowlist', () => {
    const generic = createGenericWalletNotificationAdapter({
      source: 'generic_notification',
      packageNames: ['com.verified.wallet'],
      keywords: ['received'],
      currencies: ['PEN'],
    });

    expect(
      parseWalletNotification(
        { packageName: 'com.verified.wallet', title: 'Payment received', text: 'Received S/ 12.00' },
        [generic],
      ),
    ).toMatchObject({ provider: 'generic', amountCents: 1200, currency: 'PEN' });
  });

  it('does not allow a custom adapter to broaden Lemon defaults accidentally', () => {
    expect(LEMON_NOTIFICATION_ADAPTER.packageNames).toEqual(['com.applemoncash']);
  });
});
