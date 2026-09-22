export interface LocationPoint {
  sequence: number;
  timestamp: string;
  lat: number;
  lon: number;
  accuracy: number | null;
  status: 'active' | 'gps_lost' | 'stale';
  ageMs: number;
}

export interface LocationResult {
  kind: 'location';
  dryRun: boolean;
  points: LocationPoint[];
  events: Array<{ type: string; atSeconds: number }>;
  [key: string]: unknown;
}

export interface RiderResult {
  kind: 'rider';
  dryRun: boolean;
  events: Array<{ sequence: number; state: string; atSeconds: number; speedKmh: number }>;
  invariants: { hasAccepted: boolean; terminalState: string | null; hasConnectionRecovery: boolean };
  [key: string]: unknown;
}

export interface CashResult {
  kind: 'cash';
  dryRun: boolean;
  passed: boolean;
  totals: Record<string, number>;
  invariants: Record<string, boolean>;
  [key: string]: unknown;
}

export interface PaymentResult {
  kind: 'payment';
  dryRun: boolean;
  finalStatus: string;
  idempotency: { duplicates: number; uniqueKeys: number };
  rejectedEvents: number;
  passed: boolean;
  [key: string]: unknown;
}

export function simulateLocation(options?: Record<string, unknown>): LocationResult;
export function simulateRider(options?: Record<string, unknown>): RiderResult;
export function simulateCashFlow(options?: Record<string, unknown>): CashResult;
export function simulatePayment(options?: Record<string, unknown>): PaymentResult;
