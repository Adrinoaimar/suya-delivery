import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { paymentGatewayService } from '@/lib/services';
import type { GatewayAdminResult, PaymentGatewayConfig } from '@/lib/services';
import { useBackofficeContextStore } from '@/store/backofficeContextStore';
import { formatPrice } from '@/utils/format';

const fieldClass = 'mt-1 min-h-11 w-full rounded-btn border border-suya-border bg-white px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-suya-green';
const stateLabels: Record<string, string> = {
  created: 'Solicitud creada', pending: 'Pendiente', approved: 'Recibido y confirmado',
  rejected: 'Rechazado', expired: 'Vencido', cancelled: 'Cancelado', late_review: 'Abono tardío: revisar',
  amount_mismatch: 'Importe distinto: revisar', identity_mismatch: 'Identidad distinta: revisar',
  refunded: 'Devuelto', partial_refund: 'Devolución parcial: revisar', disputed: 'Disputa: revisar',
  test_confirmed: 'Prueba confirmada; pedido retenido', duplicate: 'Evento repetido', transaction_reuse: 'Transacción ya utilizada',
};

function trustedSandboxUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['sandbox.mercadopago.com.pe', 'www.mercadopago.com.pe'].includes(url.hostname) &&
      url.pathname.startsWith('/checkout/') ? url.href : null;
  } catch { return null; }
}

export default function PaymentSettingsPage() {
  const restaurantId = useBackofficeContextStore((s) => s.activeRestaurantId);
  const location = useLocation();
  const [config, setConfig] = useState<PaymentGatewayConfig | null>(null);
  const [ledger, setLedger] = useState<GatewayAdminResult['payments']>();
  const [environment, setEnvironment] = useState<'test' | 'live'>('test');
  const [accessToken, setAccessToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [permissionsConfirmed, setPermissionsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [receiver, setReceiver] = useState('mercadopago');
  const scopeRef = useRef(0);
  const isCurrent = useCallback((scope: number, requestedId: string) =>
    scopeRef.current === scope && useBackofficeContextStore.getState().activeRestaurantId === requestedId, []);
  const prefix = location.pathname.startsWith('/backoffice/') ? '/backoffice' : '';

  const applyResult = useCallback((result: GatewayAdminResult) => {
    setConfig(result.config ?? null);
    setEnvironment(result.config?.environment ?? 'test');
    setPermissionsConfirmed(result.config?.production_permissions_confirmed ?? false);
    setLedger(result.payments);
  }, []);
  const load = useCallback(async (requestedId: string, scope: number) => {
    const result = await paymentGatewayService.admin('admin-read', { restaurantId: requestedId });
    if (isCurrent(scope, requestedId)) applyResult(result);
  }, [applyResult, isCurrent]);

  useEffect(() => {
    const scope = ++scopeRef.current;
    setConfig(null); setLedger(undefined); setError(''); setMessage(''); setSandboxUrl(null);
    setAccessToken(''); setWebhookSecret(''); setPermissionsConfirmed(false); setEnvironment('test');
    if (!restaurantId) { setBusy(false); return; }
    setBusy(true);
    void load(restaurantId, scope)
      .catch(() => isCurrent(scope, restaurantId) && setError('No pudimos cargar los cobros. Comprueba tu conexión y tus permisos.'))
      .finally(() => isCurrent(scope, restaurantId) && setBusy(false));
    return () => { scopeRef.current += 1; };
  }, [restaurantId, isCurrent, load]);

  async function run(action: Parameters<typeof paymentGatewayService.admin>[0], extra: Record<string, unknown> = {}) {
    if (!restaurantId || busy) return;
    const scope = scopeRef.current;
    setBusy(true); setError(''); setMessage(''); setSandboxUrl(null);
    try {
      const result = await paymentGatewayService.admin(action, {
        restaurantId, expectedVersion: config?.version ?? null, ...extra,
      });
      if (!isCurrent(scope, restaurantId)) return;
      if (action === 'admin-save') { setAccessToken(''); setWebhookSecret(''); }
      setSandboxUrl(trustedSandboxUrl(result.sandboxCheckoutUrl));
      setMessage(action === 'admin-save'
        ? 'Credenciales guardadas de forma cifrada. Comprueba la conexión antes de activar.'
        : action === 'admin-check' ? 'Conexión comprobada. El proveedor permitió crear una solicitud de prueba sin cobrar dinero.'
          : action === 'admin-safe-test' ? 'Enlace de sandbox preparado. Usa exclusivamente una cuenta y medios de prueba.'
            : action === 'admin-reconcile' ? 'Consulta completada con la API oficial. Revisa el estado y la auditoría.'
              : action === 'admin-read' ? 'Estado actualizado desde el servidor.' : 'Estado del método actualizado.');
      if (action === 'admin-read') applyResult(result);
      else await load(restaurantId, scope);
    } catch (cause) {
      if (isCurrent(scope, restaurantId)) setError(cause instanceof Error ? cause.message : 'No pudimos completar la operación.');
    } finally { if (isCurrent(scope, restaurantId)) setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8" aria-busy={busy}>
      <header>
        <h1 className="font-display text-2xl font-bold">Configuración de cobros — SUYA Delivery</h1>
        <p className="mt-2 text-sm text-suya-muted">Configura la cuenta autorizada para cobrar las ventas del restaurante seleccionado.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-suya-lime-soft p-3 text-sm">{message}</p>}
      {!restaurantId ? <Card><p>Selecciona un restaurante para configurar los cobros.</p></Card> : <>
        <Card>
          <label className="block text-sm font-semibold">Método receptor
            <select className={fieldClass} value={receiver} onChange={(e) => setReceiver(e.target.value)}>
              <option value="mercadopago">Mercado Pago — API oficial</option>
              <option value="manual">Yape / Lemon — QR del negocio con revisión</option>
            </select>
          </label>
          {receiver === 'manual' ? <div className="mt-4 space-y-3 text-sm">
            <p>Un QR estático permite recibir dinero; no permite verificar automáticamente que llegó. Las notificaciones, constancias y códigos son indicios para revisión.</p>
            <Link className="inline-flex min-h-11 items-center font-semibold text-suya-green underline" to={`${prefix}/wallets`}>Configurar el QR y consultar observaciones</Link>
          </div> : <>
            <div className="mt-4 rounded-xl border border-suya-border p-3 text-sm" role="status">
              <p className="font-semibold">{config?.enabled && config.has_credentials && config.verified_at && config.webhook_verified_at && config.production_permissions_confirmed && config.environment === 'live'
                ? 'Activo — confirmación automática por API oficial'
                : config?.verified_at ? 'Conectado — cobro real desactivado' : 'No activo — requiere credenciales y comprobación'}</p>
              <p className="mt-1">{config?.collector_id ? `Cuenta receptora: ${config.collector_id}. ` : ''}El restaurante acepta el pedido después de la confirmación del pago.</p>
            </div>
            <form className="mt-4 space-y-3" onSubmit={(event) => {
              event.preventDefault();
              void run('admin-save', { environment, accessToken, webhookSecret, productionPermissionsConfirmed: false });
            }}>
              <label className="block text-sm font-semibold">Entorno
                <select value={environment} onChange={(e) => setEnvironment(e.target.value as 'test' | 'live')} className={fieldClass} disabled={busy}>
                  <option value="test">Pruebas — sin dinero real</option><option value="live">Producción — cuenta habilitada para vender</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">Access Token oficial
                <input type="password" autoComplete="new-password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)}
                  className={fieldClass} required maxLength={2000} disabled={busy} placeholder={config?.has_credentials ? 'Guardado. Introduce otro para reemplazarlo.' : 'Pega el Access Token de Mercado Pago Developers'} />
              </label>
              <label className="block text-sm font-semibold">Clave secreta de firma de Webhooks
                <input type="password" autoComplete="new-password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)}
                  className={fieldClass} required maxLength={2000} disabled={busy} />
              </label>
              <p className="text-xs text-suya-muted">Se envían por HTTPS al servidor, se cifran y no se vuelven a mostrar. Guardar una cuenta nueva desactiva el cobro hasta comprobarla.</p>
              <Button type="submit" disabled={busy || !accessToken.trim() || !webhookSecret.trim()}>Guardar credenciales</Button>
            </form>
            {config?.webhook_url && <label className="mt-4 block text-sm font-semibold">URL para Webhooks (evento payment)
              <input readOnly value={config.webhook_url} className={fieldClass} onFocus={(e) => e.target.select()} />
            </label>}
            {config?.has_credentials && <div className="mt-3 rounded-xl border border-suya-border p-3 text-sm" role="status">
              <p className="font-semibold">{config.webhook_verified_at ? 'Firma de Webhooks verificada' : 'Firma de Webhooks pendiente de verificar'}</p>
              <p className="mt-1">En Mercado Pago Developers, configura la URL mostrada para el evento <strong>payment</strong> y usa «Simular notificación» para enviar una prueba oficial. Después pulsa «Actualizar verificación». Esta prueba comprueba la firma y la recepción; no acredita dinero recibido.</p>
              <a className="mt-2 inline-flex min-h-11 items-center font-semibold text-suya-green underline" href="https://www.mercadopago.com.pe/developers/es/docs/your-integrations/notifications/webhooks" target="_blank" rel="noopener noreferrer">Ver instrucciones oficiales de Webhooks</a>
              <div><Button variant="secondary" size="sm" disabled={busy} onClick={() => void run('admin-read')}>Actualizar verificación</Button></div>
            </div>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy || !config?.has_credentials} onClick={() => void run('admin-check')}>Comprobar conexión</Button>
              <Button variant="secondary" disabled={busy || !config?.has_credentials || config.environment !== 'test'} onClick={() => void run('admin-safe-test')}>Realizar prueba segura</Button>
            </div>
            {sandboxUrl && <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-suya-green underline" href={sandboxUrl} target="_blank" rel="noopener noreferrer">Abrir pago de prueba en Mercado Pago</a>}
            <label className="mt-4 flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={permissionsConfirmed} onChange={(e) => setPermissionsConfirmed(e.target.checked)} disabled={busy} />
              <span>Mi cuenta está habilitada por el proveedor para cobrar las ventas de este restaurante. He completado su verificación de identidad y aceptado sus tarifas. Si recaudo para terceros, tengo autorización contractual para hacerlo.</span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={busy || !config?.has_credentials || !config.verified_at || !config.webhook_verified_at || config.environment !== 'live' || !permissionsConfirmed || config.enabled}
                onClick={() => void run('admin-activate', { enabled: true, productionPermissionsConfirmed: permissionsConfirmed })}>Activar cobro automático</Button>
              <Button variant="secondary" disabled={busy || !config?.enabled} onClick={() => void run('admin-activate', { enabled: false, productionPermissionsConfirmed: permissionsConfirmed })}>Desactivar</Button>
            </div>
            <p className="mt-3 text-xs text-suya-muted">No hay cobro automático con tu QR personal de Yape/Plin. Mercado Pago aplica su tarifa; compruébala en tu cuenta. La comprobación de conexión no acredita un pago real ni sustituye la habilitación comercial del proveedor.</p>
          </>}
        </Card>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg font-bold">Cobros y conciliación</h2>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run('admin-read')}>Actualizar</Button></div>
          <p className="mt-2 text-sm text-suya-muted">Los abonos tardíos, importes distintos y devoluciones se revisan aquí. Consultar al proveedor nunca fuerza una aprobación.</p>
          {!ledger?.payments?.length ? <p className="mt-4 text-sm">Aún no hay cobros registrados con este proveedor.</p> : <ul className="mt-3 divide-y divide-suya-border">
            {ledger.payments.map((payment) => <li className="py-3" key={payment.attempt_id}>
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-all text-sm">{payment.checkout_reference}</strong><span>{formatPrice(payment.amount_cents / 100)}</span></div>
              <p className="mt-1 text-sm">{stateLabels[payment.gateway_state ?? ''] ?? 'Pendiente de conciliación'}</p>
              <Button variant="secondary" size="sm" className="mt-2" disabled={busy} onClick={() => void run('admin-reconcile', { attemptId: payment.attempt_id })}>Consultar al proveedor</Button>
            </li>)}
          </ul>}
          <p className="mt-4 text-xs text-suya-muted">Las devoluciones se ejecutan desde la cuenta oficial de Mercado Pago. SUYA recoge su estado mediante la API y conserva la auditoría; una devolución no borra el pedido.</p>
        </Card>
        <Card><h2 className="font-display text-lg font-bold">Historial de verificación</h2>
          {!ledger?.events?.length ? <p className="mt-3 text-sm">Sin eventos financieros verificados.</p> : <ul className="mt-3 space-y-2 text-sm">
            {ledger.events.map((event) => <li className="break-words rounded-xl border border-suya-border p-3" key={event.id}>
              <p>{stateLabels[event.outcome] ?? 'Evento registrado para revisión'} · transacción {event.transaction_id}</p>
              <time dateTime={event.received_at} className="text-xs text-suya-muted">{new Date(event.received_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</time>
            </li>)}
          </ul>}
        </Card>
      </>}
    </div>
  );
}
