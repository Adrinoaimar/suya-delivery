/**
 * Cloudflare Email Worker para Conciliación AutoCloud de QR Estático (Yape / Plin / Lemon / IzipayYA)
 * en SUYA Delivery — 100% Cloud, 0% Comisión, Sin Celular Encendido.
 *
 * Variables esperadas en Cloudflare Worker:
 * - SUYA_WEBHOOK_URL (ej. https://cggxooilzhqlcnofgtmi.supabase.co/functions/v1/payment-webhook?provider=static_qr)
 *   (o SUYA_SUPABASE_URL como alternativa)
 * - STATIC_QR_AUTOCLOUD_SECRET (o STATIC_QR_WEBHOOK_SECRET) como secreto HMAC-SHA256
 * - SUYA_RESTAURANT_ID (opcional UUID de restaurante)
 */

async function computeHmacSha256Hex(secret, message) {
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

function splitRawMime(rawMime) {
  const crlfSplit = rawMime.indexOf('\r\n\r\n');
  if (crlfSplit >= 0) {
    return { rawMimeHeaders: rawMime.slice(0, crlfSplit), rawMimeBody: rawMime.slice(crlfSplit + 4) };
  }
  const lfSplit = rawMime.indexOf('\n\n');
  if (lfSplit >= 0) {
    return { rawMimeHeaders: rawMime.slice(0, lfSplit), rawMimeBody: rawMime.slice(lfSplit + 2) };
  }
  return { rawMimeHeaders: rawMime, rawMimeBody: '' };
}

export default {
  async email(message, env) {
    const authHeader = message.headers.get('Authentication-Results') ?? '';
    const dkimHeader = message.headers.get('DKIM-Signature') ?? '';
    const subject = message.headers.get('Subject') ?? '';
    const messageId = message.headers.get('Message-ID') ?? `cf_${Date.now()}`;

    if (
      !/\bspf=pass\b/i.test(authHeader) ||
      !/\bdkim=pass\b/i.test(authHeader) ||
      !/\bdmarc=pass\b/i.test(authHeader)
    ) {
      message.setReject('Rejected: Email failed SPF, DKIM, or DMARC verification.');
      return;
    }

    const secret = (env.STATIC_QR_AUTOCLOUD_SECRET || env.STATIC_QR_WEBHOOK_SECRET || '').trim();
    const webhookUrl = (
      env.SUYA_WEBHOOK_URL ||
      (env.SUYA_SUPABASE_URL
        ? `${env.SUYA_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/payment-webhook?provider=static_qr`
        : '')
    ).trim();

    if (!secret || !webhookUrl) {
      throw new Error(
        'Missing STATIC_QR_AUTOCLOUD_SECRET or SUYA_WEBHOOK_URL configuration in Cloudflare Worker.',
      );
    }

    const rawBytes = await new Response(message.raw).arrayBuffer();
    const rawMime = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
    const { rawMimeHeaders, rawMimeBody } = splitRawMime(rawMime);

    const payload = JSON.stringify({
      messageId,
      subject,
      recipientAddress: message.to,
      authenticationResultsHeader: authHeader,
      dkimSignatureHeader: dkimHeader,
      rawMimeHeaders,
      rawMimeBody,
      rawBodyText: rawMimeBody,
      restaurantId: env.SUYA_RESTAURANT_ID || null,
    });

    const signature = await computeHmacSha256Hex(secret, payload);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-suya-autocloud-signature': `sha256=${signature}`,
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`SUYA webhook returned HTTP ${response.status}`);
    }
  },

  async scheduled(_event, env) {
    const secret = (env.STATIC_QR_AUTOCLOUD_SECRET || env.STATIC_QR_WEBHOOK_SECRET || '').trim();
    const gatewayUrl = (
      env.SUYA_GATEWAY_URL ||
      (env.SUYA_SUPABASE_URL
        ? `${env.SUYA_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/payment-gateway`
        : env.SUYA_WEBHOOK_URL
          ? env.SUYA_WEBHOOK_URL.replace(/\/functions\/v1\/payment-webhook.*$/, '/functions/v1/payment-gateway')
          : '')
    ).trim();

    if (!secret || !gatewayUrl) return;

    await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-suya-autocloud-cron': secret,
      },
      body: JSON.stringify({ action: 'sync_gmail_autocloud' }),
    });
  },
};
