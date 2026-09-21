import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../config/production.json', import.meta.url), 'utf8'));
const failures = [];
const functionsOnly = new Set(process.argv.slice(2)).has('--functions-only');
const origin = config.apps.customer.origin;
const culqiEnabled = process.env.VITE_CULQI_GATEWAY_ENABLED === 'true';
let livePublishableKey = null;
let liveSupabaseOrigin = null;

async function checkHttp(name, url, options, expectedContentType, bodyPattern, statuses = [200]) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      ...options,
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    if (!statuses.includes(response.status)) {
      failures.push(`${name}: HTTP ${response.status}.`);
      return;
    }
    if (expectedContentType && !contentType.toLowerCase().includes(expectedContentType)) {
      failures.push(`${name}: content-type inesperado (${contentType || 'ausente'}).`);
      return;
    }
    if (bodyPattern && !bodyPattern.test(body)) failures.push(`${name}: contenido inesperado.`);
    if (failures.every((failure) => !failure.startsWith(`${name}:`))) {
      console.log(`${name}: HTTP ${response.status}`);
    }
  } catch (error) {
    failures.push(`${name}: no respondió (${error instanceof Error ? error.message : 'error de red'}).`);
  }
}

if (!functionsOnly) {
  for (const [app, details] of Object.entries(config.apps)) {
    await checkHttp(`${app} raíz`, details.origin, undefined, 'text/html', /<!doctype html>/iu);
    await checkHttp(
      `${app} smoke`,
      new URL(details.smokePath, details.origin),
      undefined,
      'text/html',
      /<!doctype html>/iu,
    );
  }
}

async function checkCustomerAnalyticsBundle() {
  try {
    const response = await fetch(origin, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    const scriptSources = [
      ...new Set(
        [...html.matchAll(/(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/giu)].map(
          (match) => new URL(match[1], origin).toString(),
        ),
      ),
    ];
    if (!scriptSources.length) {
      failures.push('medidor de visitas: la página cliente no publicó bundles JavaScript.');
      return;
    }

    const bundles = [];
    const pending = [...scriptSources];
    const inspected = new Set();
    while (pending.length > 0 && inspected.size < 300) {
      const scriptUrl = pending.shift();
      if (!scriptUrl || inspected.has(scriptUrl)) continue;
      inspected.add(scriptUrl);
      const scriptResponse = await fetch(scriptUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      if (!scriptResponse.ok) continue;
      const source = await scriptResponse.text();
      bundles.push(source);

      // Vite divide el cliente en chunks importados desde el bundle de entrada.
      // La analítica puede quedar en cualquiera de ellos, por lo que inspeccionar
      // solo los <script> del HTML produce falsos negativos durante un release.
      for (const match of source.matchAll(/["']([^"']+\.js(?:\?[^"']*)?)["']/giu)) {
        try {
          const dependency = new URL(match[1], scriptUrl);
          if (dependency.origin === new URL(origin).origin && !inspected.has(dependency.toString())) {
            pending.push(dependency.toString());
          }
        } catch {
          // Una cadena terminada en .js que no sea URL no es una dependencia.
        }
      }
    }
    const bundle = bundles.join('\n');
    if (!bundle.includes('analyticsConsent')) {
      failures.push('medidor de visitas: el bundle cliente no contiene el estado de consentimiento.');
    }
    if (!bundle.includes('record_suya_analytics_visit')) {
      failures.push('medidor de visitas: el bundle cliente no contiene el registro first-party.');
    }
    const publishedSupabaseOrigin = bundle.match(
      new RegExp(`https://${config.supabaseProjectRef}\\.supabase\\.co`, 'iu'),
    )?.[0];
    const publishedPublishableKey = bundle.match(/sb_publishable_[A-Za-z0-9._-]{20,}/u)?.[0];
    if (!publishedSupabaseOrigin || !publishedPublishableKey) {
      failures.push(
        'medidor de visitas: el bundle no publicó la configuración pública de Supabase necesaria.',
      );
    } else {
      // La publishable key no es un secreto; solo se usa para una comprobación
      // deliberadamente inválida y no mutante contra la RPC publicada.
      liveSupabaseOrigin = publishedSupabaseOrigin;
      livePublishableKey = publishedPublishableKey;
    }
    if (
      failures.every(
        (failure) => !failure.startsWith('medidor de visitas:'),
      )
    ) {
      console.log(`${origin} medidor: bundle first-party activo`);
    }
  } catch (error) {
    failures.push(
      `medidor de visitas: no se pudo inspeccionar el bundle (${error instanceof Error ? error.message : 'error de red'}).`,
    );
  }
}

if (!functionsOnly) await checkCustomerAnalyticsBundle();

async function checkCustomerAnalyticsRpc() {
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || livePublishableKey;
  const supabaseOrigin =
    config.supabaseUrl ?? liveSupabaseOrigin ?? `https://${config.supabaseProjectRef}.supabase.co`;
  if (!publishableKey) {
    failures.push('RPC del medidor: no se encontró una publishable key válida.');
    return;
  }

  try {
    const response = await fetch(`${supabaseOrigin}/rest/v1/rpc/record_suya_analytics_visit`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
      },
      // Entrada deliberadamente inválida: confirma que la función existe sin
      // insertar una visita ni modificar datos de producción.
      body: JSON.stringify({ p_visitor_id: 'invalid-live-audit-visitor' }),
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.status !== 400 || !contentType.toLowerCase().includes('application/json')) {
      failures.push(
        `RPC del medidor: respuesta inesperada (HTTP ${response.status}, ${contentType || 'sin content-type'}).`,
      );
      return;
    }
    console.log(`${supabaseOrigin} RPC del medidor: presente (prueba no mutante)`);
  } catch (error) {
    failures.push(
      `RPC del medidor: no se pudo comprobar (${error instanceof Error ? error.message : 'error de red'}).`,
    );
  }
}

await checkCustomerAnalyticsRpc();

if (!functionsOnly) {
  await checkHttp(
    `${config.apps.customer.origin} robots.txt`,
    new URL('/robots.txt', origin),
    undefined,
    'text/plain',
    /User-agent:\s*\*/iu,
  );
  await checkHttp(
    `${config.apps.customer.origin} sitemap.xml`,
    new URL('/sitemap.xml', origin),
    undefined,
    'application/xml',
    /<urlset\b[^>]*>/iu,
  );
  await checkHttp(
    `${config.apps.customer.origin} llms.txt`,
    new URL('/llms.txt', origin),
    undefined,
    'text/plain',
    /# Suya Delivery/iu,
  );
}

const functionChecks = [
  ['route-driving', 'route-driving/route/v1/driving/0,0;0.01,0'],
  ...(culqiEnabled
    ? [
        ['create-culqi-order', 'create-culqi-order'],
        ['charge-culqi-card', 'charge-culqi-card'],
        ['culqi-webhook', 'culqi-webhook'],
      ]
    : []),
];
for (const [name, path] of functionChecks) {
  await checkHttp(
    `Edge Function ${name}`,
    `${config.supabaseUrl ?? `https://${config.supabaseProjectRef}.supabase.co`}/functions/v1/${path}`,
    { method: 'OPTIONS', headers: { Origin: origin } },
    '',
    null,
    [200, 204],
  );
  // OPTIONS solo confirma CORS. Un GET sin una sesión válida debe alcanzar el
  // handler y devolver 401; un 404 o 503 demuestra que la función no está
  // publicada o no tiene su configuración interna completa.
  await checkHttp(
    `Edge Function ${name} auth`,
    `${config.supabaseUrl ?? `https://${config.supabaseProjectRef}.supabase.co`}/functions/v1/${path}`,
    {
      method: 'GET',
      headers: {
        Origin: origin,
        Authorization: 'Bearer invalid-live-audit-token',
      },
    },
    'application/json',
    /sesi[oó]n|auth|authorization/iu,
    [401],
  );
}

if (!culqiEnabled) console.log('Culqi: omitido (VITE_CULQI_GATEWAY_ENABLED no está en true).');

if (failures.length) {
  console.error('Auditoría live no apta:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  functionsOnly
    ? 'Auditoría live apta: RPC analítica y Edge Functions responden correctamente.'
    : 'Auditoría live apta: webs, SEO y Edge Functions responden correctamente.',
);
