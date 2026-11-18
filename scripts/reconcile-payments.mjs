import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Conciliación oficial: nunca autoriza desde este proceso ni registra secretos o bodies. */
export async function reconcilePayments({ endpoint, token, fetcher = fetch, delay = (ms) => new Promise((done) => setTimeout(done, ms)), retries = 2, timeoutMs = 70_000 }) {
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('Configura PAYMENT_GATEWAY_URL con la Edge Function de SUYA.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.pathname !== '/functions/v1/payment-gateway' || url.search || url.hash || url.port || url.username || url.password) {
    throw new Error('PAYMENT_GATEWAY_URL debe identificar una Edge Function HTTPS de Supabase, sin parámetros.');
  }
  if (typeof token !== 'string' || token.length < 32 || /[\r\n]/.test(token)) throw new Error('Configura PAYMENT_RECONCILE_TOKEN con al menos 32 caracteres.');
  if (!Number.isSafeInteger(retries) || retries < 0 || retries > 3) throw new Error('La cantidad de reintentos debe estar entre cero y tres.');
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;
    try {
      response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reconcile' }), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      if (attempt < retries) { await delay(500 * 2 ** attempt); continue; }
      throw new Error('No se pudo conectar con la conciliación de SUYA. El siguiente ciclo puede reintentar.');
    }
    if (response.status >= 500) {
      if (attempt < retries) { await delay(500 * 2 ** attempt); continue; }
      throw new Error(`La conciliación no pudo completarse (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(`La conciliación fue rechazada (HTTP ${response.status}). Revisa la configuración del servidor.`);
    let result;
    try { result = await response.json(); } catch { throw new Error('La conciliación devolvió una respuesta inválida.'); }
    if (!result || !Number.isSafeInteger(result.processed) || result.processed < 0 || !Number.isSafeInteger(result.failed) || result.failed < 0 || !Number.isSafeInteger(result.deferred ?? 0) || (result.deferred ?? 0) < 0) {
      throw new Error('La conciliación devolvió un resumen inválido.');
    }
    if (response.status === 207 || result.failed > 0 || (result.deferred ?? 0) > 0) throw new Error(`Conciliación incompleta: ${result.processed} intentos consultados, ${result.failed} fallidos y ${result.deferred ?? 0} pendientes de otro ciclo.`);
    return { processed: result.processed, failed: result.failed, deferred: result.deferred ?? 0 };
  }
  throw new Error('La conciliación no pudo completarse.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await reconcilePayments({ endpoint: process.env.PAYMENT_GATEWAY_URL, token: process.env.PAYMENT_RECONCILE_TOKEN });
    console.log(`Conciliación de pagos: ${result.processed} intentos consultados; sin fallos ni pendientes diferidos.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'La conciliación de pagos falló.');
    process.exitCode = 1;
  }
}
