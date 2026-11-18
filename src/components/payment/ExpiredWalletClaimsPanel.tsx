import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { walletObserverService } from '@/lib/services';
import type { ExpiredWalletClaim } from '@/lib/services';
import { formatDateTime, formatPrice } from '@/utils/format';

export function ExpiredWalletClaimsPanel({ restaurantId }: { restaurantId: string }) {
  const [claims, setClaims] = useState<ExpiredWalletClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  const load = useCallback(async () => {
    const token = ++request.current;
    setLoading(true);
    setError('');
    try {
      const result = await walletObserverService.listExpiredWalletClaims?.(restaurantId);
      if (request.current === token) setClaims(result ?? []);
    } catch {
      if (request.current === token) setError('No pudimos cargar los reclamos. Vuelve a intentarlo.');
    } finally {
      if (request.current === token) setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  async function markReviewed(attemptId: string) {
    if (reviewing) return;
    const token = request.current;
    setReviewing(attemptId);
    setError('');
    try {
      if (!await walletObserverService.reviewExpiredWalletClaim?.(restaurantId, attemptId)) throw new Error();
      if (request.current === token) setClaims((current) => current.filter((claim) => claim.attemptId !== attemptId));
    } catch {
      if (request.current === token) setError('No pudimos marcar el reclamo como revisado.');
    } finally {
      if (request.current === token) setReviewing(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Reclamos por QR vencido</h2>
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading || Boolean(reviewing)}>
          Actualizar reclamos
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-suya-danger" role="alert">{error}</p>}
      {loading ? <p className="mt-2 text-sm text-suya-muted" role="status">Cargando reclamos…</p>
        : claims.length === 0 && !error ? <p className="mt-2 text-sm text-suya-muted">No hay reclamos pendientes.</p>
          : (
            <ul className="mt-2 divide-y divide-suya-mist">
              {claims.map((claim) => (
                <li key={claim.attemptId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-0.5 break-words text-sm">
                    <p className="font-semibold">Pedido {claim.orderCode} · {claim.method === 'lemon' ? 'Lemon' : 'Yape'} · {formatPrice(claim.amount)}</p>
                    <p>Pagador declarado: {claim.payerName}</p>
                    {claim.receiptReference && <p>Referencia: {claim.receiptReference}</p>}
                    <p className="text-suya-muted">{formatDateTime(claim.reportedAt)}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void markReviewed(claim.attemptId)} disabled={Boolean(reviewing)}>
                    {reviewing === claim.attemptId ? 'Guardando…' : 'Marcar revisado'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
      {claims.length > 0 && <p className="text-sm text-suya-muted">Comprueba el abono en la billetera receptora. Marcar un reclamo como revisado solo lo retira de la lista de pendientes.</p>}
    </Card>
  );
}
