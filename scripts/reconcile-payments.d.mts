export interface ReconcileOptions {
  endpoint: string | undefined;
  token: string | undefined;
  fetcher?: typeof fetch;
  delay?: (ms: number) => Promise<void>;
  retries?: number;
  timeoutMs?: number;
}
export function reconcilePayments(options: ReconcileOptions): Promise<{ processed: number; failed: number; deferred: number }>;
