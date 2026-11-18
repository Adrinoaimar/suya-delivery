import { timingSafeEqualText, verifyEmailDkimCryptographic } from './dkim.ts';

function json(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function computeHmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function decodeMimeTextForParsing(rawMimeBody: string): string {
  // Decodifica quoted-printable suave y quita etiquetas HTML para extraer monto y operación
  const dequoted = rawMimeBody
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return dequoted
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
}

const TRUSTED_DKIM_DOMAINS = new Set([
  'notificacionesbcp.com.pe',
  'bcp.com.pe',
  'yape.com.pe',
  'interbank.pe',
  'interbank.com.pe',
  'netinterbank.com.pe',
  'bbva.com.pe',
  'scotiabank.com.pe',
  'izipay.pe',
  'lemon.me',
  'dale.pe',
  'gmoney.pe',
  'gmoney.com.pe',
]);

interface RuntimeGatewayConfig {
  config_id: string;
  restaurant_id: string;
  provider: string;
  public_key: string | null;
  secret_key: string | null;
  webhook_secret: string | null;
  active: boolean;
}

async function fetchRuntimeConfigs(
  supabaseUrl: string,
  serviceRoleKey: string,
  restaurantId: string | null,
  provider: string,
): Promise<RuntimeGatewayConfig[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_payment_gateway_runtime_config`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({
      p_restaurant_id: restaurantId,
      p_provider: provider,
    }),
  }).catch(() => null);
  if (!res?.ok) return [];
  const rows = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(rows) ? (rows as RuntimeGatewayConfig[]) : [];
}

async function verifyMercadoPagoSignature(
  request: Request,
  dataId: string,
  secret: string,
): Promise<boolean> {
  const signatureHeader = request.headers.get('x-signature') ?? '';
  const requestId = request.headers.get('x-request-id') ?? '';
  if (!signatureHeader || !requestId || !dataId || !secret) return false;

  const parts = new Map<string, string>();
  for (const segment of signatureHeader.split(',')) {
    const [k, v] = segment.split('=');
    if (k && v) parts.set(k.trim(), v.trim());
  }
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1 || !/^\d+$/.test(ts)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(ts)) > 300) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = await computeHmacSha256Hex(secret, manifest);
  return timingSafeEqualText(expected, v1.toLowerCase());
}

function serviceHeaders(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

export const automaticHandler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Webhook no configurado en el servidor.' }, 503);
  }

  const url = new URL(request.url);
  const rawBody = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const providerParam = url.searchParams.get('provider')?.toLowerCase() ?? '';
  const hasAutoCloudHeader = Boolean(request.headers.get('x-suya-autocloud-signature'));
  const hasTaypiHeader = Boolean(request.headers.get('taypi-signature'));
  const hasMpHeader = Boolean(request.headers.get('x-signature'));
  const provider =
    providerParam ||
    (hasAutoCloudHeader
      ? 'static_qr'
      : hasTaypiHeader
        ? 'taypi_qr'
        : hasMpHeader
          ? 'mercado_pago'
          : '');

  // 1. Webhook AutoCloud QR Estático (Yape, Plin, Lemon, IzipayYA) con verificación criptográfica DKIM/SPF/DMARC
  if (provider === 'static_qr') {
    if (Deno.env.get('STATIC_QR_AUTOCLOUD_ENABLED') !== 'true') {
      return json({ error: 'AutoCloud requiere validar primero el correo real y su receptor.' }, 503);
    }
    const requestedRestaurantId = isUuid(payload.restaurantId) ? payload.restaurantId : null;
    const dbConfigs = await fetchRuntimeConfigs(
      supabaseUrl,
      serviceRoleKey,
      requestedRestaurantId,
      'static_qr',
    );
    const envSecret = Deno.env.get('STATIC_QR_AUTOCLOUD_SECRET')?.trim() || '';
    const candidateConfigs: Array<{ restaurantId: string | null; secret: string }> = [
      ...dbConfigs
        .filter((c) => c.webhook_secret?.trim())
        .map((c) => ({ restaurantId: c.restaurant_id, secret: c.webhook_secret!.trim() })),
      ...(envSecret ? [{ restaurantId: requestedRestaurantId, secret: envSecret }] : []),
    ];

    if (candidateConfigs.length === 0) {
      return json({ error: 'Secreto de puente AutoCloud QR Estático no configurado.' }, 503);
    }

    const sigHeader = (request.headers.get('x-suya-autocloud-signature') ?? '')
      .trim()
      .replace(/^sha256=/i, '')
      .toLowerCase();

    const matchedConfigs: Array<{ restaurantId: string | null; secret: string }> = [];
    if (sigHeader) {
      for (const candidate of candidateConfigs) {
        const expectedHmac = await computeHmacSha256Hex(candidate.secret, rawBody);
        if (timingSafeEqualText(expectedHmac, sigHeader)) {
          matchedConfigs.push(candidate);
        }
      }
    }
    if (matchedConfigs.length === 0) {
      return json({ error: 'Firma HMAC del puente AutoCloud inválida.' }, 401);
    }

    const authResults = text(payload.authenticationResultsHeader);
    const rawMimeHeaders = text(payload.rawMimeHeaders);
    const rawMimeBody = text(payload.rawMimeBody);
    const emailBodyText = text(payload.rawBodyText);
    const subject = text(payload.subject);
    const messageId = text(payload.messageId, `msg_${Date.now()}`);
    const recipientAddress = text(payload.recipientAddress);

    const hasGlobalEnvMatch =
      !requestedRestaurantId && matchedConfigs.some((c) => c.restaurantId === null);
    const matchedRestaurantIds = hasGlobalEnvMatch
      ? null
      : Array.from(
          new Set(
            matchedConfigs
              .map((c) => requestedRestaurantId ?? c.restaurantId)
              .filter((id): id is string => isUuid(id)),
          ),
        );

    const dkimResult = await verifyEmailDkimCryptographic({
      rawHeaders: rawMimeHeaders,
      rawBody: rawMimeBody || emailBodyText,
      authenticationResultsHeader: authResults || null,
      trustedDomains: TRUSTED_DKIM_DOMAINS,
      requireMtaPass: true,
    });

    if (!dkimResult.authentic || !dkimResult.dkimDomain) {
      return json(
        {
          error: `Correo rechazado por verificación criptográfica DKIM (${dkimResult.reason ?? 'dkim_failed'}).`,
        },
        422,
      );
    }

    const dkimDomain = dkimResult.dkimDomain;
    const parsableText = rawMimeBody ? decodeMimeTextForParsing(rawMimeBody) : emailBodyText;
    const effectiveSubject = dkimResult.subject ?? subject;
    const effectiveTo = dkimResult.toAddress ?? recipientAddress;
    const combined = `${effectiveSubject}\n${parsableText}`;
    const amountMatch = combined.match(/(?:S\/\.?|PEN)\s*([0-9]{1,5}(?:,[0-9]{3})*\.[0-9]{2})/i);
    const opMatch =
      combined.match(
        /(?:n[úu]mero\s+de\s+operaci[óo]n|c[óo]digo\s+de\s+operaci[óo]n|operaci[óo]n\s+n[°º.]?|id\s+de\s+transacci[óo]n|operaci[óo]n)\s*[:#-]?\s*([A-Z0-9-]{5,20})/i,
      ) ?? combined.match(/\bOP[-:]?([0-9]{6,14})\b/i);

    if (!amountMatch || !opMatch) {
      return json({ received: true, ignored: 'no_amount_or_operation_id' });
    }

    const amountCents = Math.round(Number(amountMatch[1].replace(/,/g, '')) * 100);
    const operationId = opMatch[1].trim();
    const senderMatch = combined.match(
      /(?:enviado\s+por|ordenante|remitente|cliente|pagador|de)\s*:\s*([^:\r\n0-9]{3,80})/i,
    );
    const payerName = senderMatch
      ? senderMatch[1]
          .replace(/\s+(?:n[úu]mero|c[óo]digo|operaci[óo]n|monto|referencia|fecha|hora)\b.*$/i, '')
          .trim() || null
      : null;
    const checkoutReference =
      combined.match(/\b(SUYA-[A-Z0-9-]{4,32})\b/i)?.[1]?.toUpperCase() ??
      effectiveTo.match(/\+(suya-[a-z0-9-]{4,32})@/i)?.[1]?.toUpperCase() ??
      null;

    const networkPrefix = dkimDomain.includes('izipay')
      ? 'izipayya'
      : dkimDomain.includes('lemon') || dkimDomain.includes('gmoney') || dkimDomain.includes('dale')
        ? 'lemon'
        : dkimDomain.includes('interbank') ||
            dkimDomain.includes('bbva') ||
            dkimDomain.includes('scotiabank')
          ? 'plin'
          : 'yape';

    const eventId = `autocloud_${dkimDomain}_${messageId}`;
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/payment_webhook_events?provider=eq.static_qr&event_id=eq.${encodeURIComponent(
        eventId,
      )}&select=id,processing_status&limit=1`,
      { headers: serviceHeaders(serviceRoleKey) },
    ).catch(() => null);
    if (existingRes?.ok) {
      const existingRows = (await existingRes.json()) as Array<{ processing_status?: string }>;
      if (existingRows[0]?.processing_status === 'processed') {
        return json({ received: true, status: 'duplicate' });
      }
    }

    let targetAttemptId = '';
    const findRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/find_pending_static_qr_attempt_for_autocloud`,
      {
        method: 'POST',
        headers: serviceHeaders(serviceRoleKey),
        body: JSON.stringify({
          p_restaurant_ids: matchedRestaurantIds,
          p_checkout_reference: checkoutReference,
          p_amount_cents: amountCents,
          p_wallet_network: networkPrefix,
          p_payer_name: payerName,
        }),
      },
    );
    if (findRes.ok) {
      const candidates = (await findRes.json()) as Array<{ payment_attempt_id?: string }>;
      if (candidates.length === 1) {
        targetAttemptId = text(candidates[0]?.payment_attempt_id);
      }
    }

    if (!isUuid(targetAttemptId)) {
      await fetch(`${supabaseUrl}/rest/v1/payment_webhook_events`, {
        method: 'POST',
        headers: serviceHeaders(serviceRoleKey),
        body: JSON.stringify({
          provider: 'static_qr',
          event_id: eventId,
          event_type: 'payment.unreconciled',
          external_transaction_id: `${networkPrefix}_${operationId}`,
          restaurant_id:
            matchedRestaurantIds && matchedRestaurantIds.length === 1
              ? matchedRestaurantIds[0]
              : null,
          signature_verified: true,
          api_verified: true,
          amount_cents: amountCents,
          currency: 'PEN',
          processing_status: 'unreconciled',
          failure_reason: 'unmatched_or_ambiguous_static_qr_candidate',
          raw_payload: {
            dkimDomain,
            walletNetwork: networkPrefix,
            operationId,
            amountCents,
            payerName,
          },
          processed_at: new Date().toISOString(),
        }),
      }).catch(() => null);
      return json({ received: true, status: 'unmatched_pending_order' });
    }

    const settleResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/settle_verified_gateway_payment`,
      {
        method: 'POST',
        headers: serviceHeaders(serviceRoleKey),
        body: JSON.stringify({
          p_provider: 'static_qr',
          p_event_id: `autocloud_${dkimDomain}_${messageId}`,
          p_external_transaction_id: `${networkPrefix}_${operationId}`,
          p_payment_attempt_id: targetAttemptId,
          p_amount_cents: amountCents,
          p_currency: 'PEN',
          p_provider_status: 'approved',
          p_raw_payload: {
            dkimDomain,
            walletNetwork: networkPrefix,
            operationId,
            amountCents,
            payerName,
          },
        }),
      },
    );

    if (!settleResponse.ok) {
      console.error('Static QR AutoCloud webhook update failed', settleResponse.status);
      return json({ error: 'No se pudo persistir la confirmación AutoCloud.' }, 502);
    }

    return json({ received: true, provider: 'static_qr', walletNetwork: networkPrefix });
  }

  // 2. Webhook de Mercado Pago Perú (HMAC-SHA256 + consulta server-to-server GET /v1/payments/{id})
  if (provider === 'mercado_pago') {
    const dbConfigs = await fetchRuntimeConfigs(supabaseUrl, serviceRoleKey, null, 'mercado_pago');
    const envWebhookSecret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')?.trim() || '';
    const envAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')?.trim() || '';

    const candidates = [
      ...dbConfigs
        .filter((c) => c.webhook_secret?.trim() && c.secret_key?.trim())
        .map((c) => ({
          webhookSecret: c.webhook_secret!.trim(),
          accessToken: c.secret_key!.trim(),
        })),
      ...(envWebhookSecret && envAccessToken
        ? [{ webhookSecret: envWebhookSecret, accessToken: envAccessToken }]
        : []),
    ];
    if (candidates.length === 0) {
      return json({ error: 'Credenciales de Webhook Mercado Pago no configuradas.' }, 503);
    }

    const dataObj =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : {};
    const dataId = text(dataObj.id || url.searchParams.get('data.id'));
    if (!dataId) return json({ received: true });

    let verifiedCandidate: { webhookSecret: string; accessToken: string } | null = null;
    for (const candidate of candidates) {
      if (await verifyMercadoPagoSignature(request, dataId, candidate.webhookSecret)) {
        verifiedCandidate = candidate;
        break;
      }
    }
    if (!verifiedCandidate) {
      return json({ error: 'Firma HMAC de Mercado Pago inválida.' }, 401);
    }

    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`,
      {
        headers: { Authorization: `Bearer ${verifiedCandidate.accessToken}` },
      },
    );
    if (!paymentResponse.ok) {
      return json({ error: 'No se pudo verificar el pago en la API de Mercado Pago.' }, 502);
    }

    const paymentInfo = (await paymentResponse.json()) as {
      id?: unknown;
      status?: unknown;
      transaction_amount?: unknown;
      currency_id?: unknown;
      external_reference?: unknown;
      metadata?: Record<string, unknown>;
    };

    const externalTxId = text(paymentInfo.id);
    const attemptId = text(
      paymentInfo.metadata?.suya_payment_attempt_id ?? paymentInfo.external_reference,
    );
    if (!isUuid(attemptId)) return json({ received: true });

    const amountCents = Math.round(Number(paymentInfo.transaction_amount) * 100);
    const currency = text(paymentInfo.currency_id, 'PEN');
    const mpStatus = text(paymentInfo.status).toLowerCase();
    const eventId = text(payload.id, `mp_${externalTxId}_${mpStatus}`);

    const settleResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/settle_verified_gateway_payment`,
      {
        method: 'POST',
        headers: serviceHeaders(serviceRoleKey),
        body: JSON.stringify({
          p_provider: 'mercado_pago',
          p_event_id: eventId,
          p_external_transaction_id: externalTxId,
          p_payment_attempt_id: attemptId,
          p_amount_cents: amountCents,
          p_currency: currency,
          p_provider_status: mpStatus === 'approved' ? 'approved' : mpStatus,
          p_raw_payload: { id: externalTxId, status: mpStatus },
        }),
      },
    );

    if (!settleResponse.ok) {
      console.error('Payment attempt webhook update failed', settleResponse.status);
      return json({ error: 'No se pudo persistir la liquidación del pago.' }, 502);
    }

    return json({ received: true });
  }

  // 3. Webhook de TAYPI / KUTI QR Dinámico EMVCo (HMAC-SHA256 sobre rawBody)
  if (provider === 'taypi_qr') {
    const dbConfigs = await fetchRuntimeConfigs(supabaseUrl, serviceRoleKey, null, 'taypi_qr');
    const envSecret = Deno.env.get('TAYPI_WEBHOOK_SECRET')?.trim() || '';
    const secrets = [
      ...dbConfigs.map((c) => c.webhook_secret?.trim() ?? '').filter(Boolean),
      ...(envSecret ? [envSecret] : []),
    ];
    if (secrets.length === 0) {
      return json({ error: 'Secreto de Webhook TAYPI no configurado.' }, 503);
    }

    const sigHeader = (request.headers.get('taypi-signature') ?? '')
      .trim()
      .replace(/^sha256=/i, '')
      .toLowerCase();
    let validSig = false;
    if (sigHeader) {
      for (const secret of secrets) {
        const expectedSig = await computeHmacSha256Hex(secret, rawBody);
        if (timingSafeEqualText(expectedSig, sigHeader)) {
          validSig = true;
          break;
        }
      }
    }
    if (!validSig) {
      return json({ error: 'Firma HMAC de TAYPI inválida.' }, 401);
    }

    const attemptId = text(payload.reference ?? payload.attempt_id);
    const externalTxId = text(payload.transaction_id ?? payload.id);
    const eventId = text(payload.event_id, `taypi_${externalTxId}`);
    const amountCents =
      payload.amount_cents != null
        ? Math.round(Number(payload.amount_cents))
        : Math.round(Number(payload.amount) * 100);
    const status = text(payload.status).toLowerCase();

    if (!isUuid(attemptId) || !externalTxId) return json({ received: true });

    const settleResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/settle_verified_gateway_payment`,
      {
        method: 'POST',
        headers: serviceHeaders(serviceRoleKey),
        body: JSON.stringify({
          p_provider: 'taypi_qr',
          p_event_id: eventId,
          p_external_transaction_id: externalTxId,
          p_payment_attempt_id: attemptId,
          p_amount_cents: amountCents,
          p_currency: text(payload.currency, 'PEN'),
          p_provider_status: status === 'completed' || status === 'approved' ? 'approved' : status,
          p_raw_payload: { id: externalTxId, status },
        }),
      },
    );

    if (!settleResponse.ok) {
      console.error('Payment attempt webhook update failed', settleResponse.status);
      return json({ error: 'No se pudo persistir la confirmación TAYPI.' }, 502);
    }

    return json({ received: true });
  }

  return json({ error: 'Proveedor de webhook no especificado o no soportado.' }, 400);
};
