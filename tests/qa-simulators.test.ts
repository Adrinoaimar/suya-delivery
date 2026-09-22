import { describe, expect, it } from 'vitest';
import { simulateCashFlow, simulateLocation, simulatePayment, simulateRider } from '../scripts/qa/simulate.mjs';

describe('simuladores QA locales', () => {
  it('genera ruta de ubicación determinista con pérdida y recuperación GPS', () => {
    const first = simulateLocation({ lat: '-12', lon: '-77', duration: '4', interval_ms: '1000', gps_lost_at: '1', recover_at: '3', seed: '7', dry_run: true });
    const second = simulateLocation({ lat: '-12', lon: '-77', duration: '4', interval_ms: '1000', gps_lost_at: '1', recover_at: '3', seed: '7', dry_run: true });
    expect(first).toEqual(second);
    expect(first.points.map((point) => point.status)).toEqual(['active', 'gps_lost', 'gps_lost', 'active', 'active']);
    expect(first.events.map((event) => event.type)).toContain('gps_recovered');
  });

  it('recorre ciclo rider y registra reconexión', () => {
    const result = simulateRider({ scenario: 'delivery', offline_at: '60', speed_kmh: '30', dry_run: true });
    expect(result.invariants.hasAccepted).toBe(true);
    expect(result.invariants.terminalState).toBe('delivered');
    expect(result.invariants.hasConnectionRecovery).toBe(true);
  });

  it('mantiene invariantes de caja, cancelación y reembolso', () => {
    const result = simulateCashFlow({ orders: '5', riders: '2', include_cancellation: true, include_refund: true, dry_run: true });
    expect(result.passed).toBe(true);
    expect(result.invariants.refundWithinCharge).toBe(true);
    expect(result.totals.refunded).toBeGreaterThan(0);
  });

  it('deduplica webhook sintético y rechaza firma inválida', () => {
    const duplicate = simulatePayment({ scenario: 'webhook-duplicate', dry_run: true });
    const invalid = simulatePayment({ scenario: 'invalid-signature', dry_run: true });
    expect(duplicate.idempotency.duplicates).toBe(1);
    expect(duplicate.finalStatus).toBe('approved');
    expect(invalid.rejectedEvents).toBe(1);
    expect(invalid.passed).toBe(true);
  });
});
