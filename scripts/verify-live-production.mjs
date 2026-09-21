import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../config/production.json', import.meta.url), 'utf8'));
const failures = [];
const origin = config.apps.customer.origin;
const culqiEnabled = process.env.VITE_CULQI_GATEWAY_ENABLED === 'true';

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

async function checkCustomerAnalyticsBundle() {
  try {
    const response = await fetch(origin, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    const scriptSources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/giu)].map(
      (match) => new URL(match[1], origin).toString(),
    );
    if (!scriptSources.length) {
      failures.push('medidor de visitas: la página cliente no publicó bundles JavaScript.');
      return;
    }

    const bundles = [];
    for (const scriptUrl of scriptSources) {
      const scriptResponse = await fetch(scriptUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      if (scriptResponse.ok) bundles.push(await scriptResponse.text());
    }
    const bundle = bundles.join('\n');
    if (!bundle.includes('analyticsConsent')) {
      failures.push('medidor de visitas: el bundle cliente no contiene el estado de consentimiento.');
    }
    if (!bundle.includes('record_suya_analytics_visit')) {
      failures.push('medidor de visitas: el bundle cliente no contiene el registro first-party.');
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

await checkCustomerAnalyticsBundle();

await checkHttp(`${config.apps.customer.origin} robots.txt`, new URL('/robots.txt', origin), undefined, 'text/plain', /User-agent:\s*\*/iu);
await checkHttp(`${config.apps.customer.origin} sitemap.xml`, new URL('/sitemap.xml', origin), undefined, 'application/xml', /<urlset\b[^>]*>/iu);

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
}

if (!culqiEnabled) console.log('Culqi: omitido (VITE_CULQI_GATEWAY_ENABLED no está en true).');

if (failures.length) {
  console.error('Auditoría live no apta:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Auditoría live apta: webs, SEO y Edge Functions responden correctamente.');
