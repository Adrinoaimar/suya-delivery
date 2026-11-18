import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Input } from '@/components/common/Input';
import { paymentService } from '@/lib/services';

export function ExpiredWalletClaimForm({ orderId, attemptId }: { orderId: string; attemptId: string }) {
  const [payerName, setPayerName] = useState('');
  const [reference, setReference] = useState('');
  const [reported, setReported] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.resolve(paymentService.getExpiredWalletClaim?.(orderId, attemptId))
      .then((date) => { if (active && date) setReported(true); })
      .catch(() => undefined)
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [orderId, attemptId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || reported || checking || !paymentService.reportExpiredWalletClaim) return;

    const name = payerName.trim();
    const receipt = reference.trim();
    if (name.length < 2 || (receipt && !/^[a-zA-Z0-9-]{3,48}$/.test(receipt))) {
      setError('Revisa el nombre y la referencia del comprobante.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await paymentService.reportExpiredWalletClaim(orderId, attemptId, name, receipt || null);
      setReported(true);
    } catch {
      setError('No se pudo enviar el reclamo. Conserva tu comprobante y vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-suya-border bg-suya-sun-soft">
      <h2 className="font-display text-base font-bold">El QR venció</h2>
      {checking ? (
        <p role="status" className="mt-2 text-sm text-suya-muted">Consultando si Caja recibió un reclamo…</p>
      ) : reported ? (
        <p role="status" className="mt-2 text-sm text-suya-carbon">
          <strong>Reclamo enviado a Caja.</strong> Conserva el comprobante y evita pagar de nuevo mientras revisan el abono.
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="mt-2 space-y-3">
          <p className="text-sm text-suya-carbon">
            Si ya pagaste, envía los datos del comprobante para que el local revise el abono.
          </p>
          <Input label="Nombre de quien pagó" value={payerName} required minLength={2} maxLength={120}
            disabled={busy} onChange={(event) => setPayerName(event.target.value)} />
          <Input label="Referencia del comprobante (opcional)" value={reference} maxLength={48}
            disabled={busy} onChange={(event) => setReference(event.target.value)} />
          {error && <p role="alert" className="text-sm text-suya-danger">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar reclamo a Caja'}
          </Button>
        </form>
      )}
    </Card>
  );
}
