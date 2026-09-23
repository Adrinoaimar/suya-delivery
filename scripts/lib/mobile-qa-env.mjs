const productionRef = 'cggxooilzhqlcnofgtmi';
const productionHosts = new Set([
  'suyadelivery.com',
  'rider.suyadelivery.com',
  'panel.suyadelivery.com',
]);

function httpsUrl(value, variable, failures) {
  try {
    const parsed = new URL(value ?? '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
      throw new Error('invalid');
    }
    return parsed;
  } catch {
    failures.push(`${variable} debe ser una URL HTTPS de staging.`);
    return null;
  }
}

export function inspectMobileQaEnv(env) {
  const failures = [];
  const ref = env.VITE_EXPECTED_SUPABASE_PROJECT_REF?.trim();
  const supabase = httpsUrl(env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL', failures);

  if (env.VITE_BACKEND !== 'supabase') failures.push('VITE_BACKEND debe ser supabase.');
  if (!ref || !/^[a-z0-9]{20}$/u.test(ref) || ref === productionRef) {
    failures.push('VITE_EXPECTED_SUPABASE_PROJECT_REF debe identificar staging, nunca producción.');
  }
  if (supabase && (supabase.hostname !== `${ref}.supabase.co` || supabase.pathname !== '/')) {
    failures.push('VITE_SUPABASE_URL debe coincidir con el project ref de staging.');
  }
  if (!env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    failures.push('Falta VITE_SUPABASE_PUBLISHABLE_KEY de staging.');
  }
  if (env.VITE_CULQI_GATEWAY_ENABLED !== 'false') {
    failures.push('VITE_CULQI_GATEWAY_ENABLED debe ser false en APKs QA.');
  }

  const routing = httpsUrl(env.VITE_ROUTING_URL, 'VITE_ROUTING_URL', failures);
  if (routing && supabase && routing.origin !== supabase.origin) {
    failures.push('VITE_ROUTING_URL debe usar el mismo proyecto Supabase de staging.');
  }
  for (const variable of ['VITE_CUSTOMER_APP_URL', 'VITE_RIDER_APP_URL', 'VITE_BACKOFFICE_APP_URL']) {
    const url = httpsUrl(env[variable], variable, failures);
    if (url && productionHosts.has(url.hostname)) {
      failures.push(`${variable} no puede apuntar a producción.`);
    }
  }
  if (env.VITE_LIVE_UPDATE_BASE_URL?.trim()) {
    const ota = httpsUrl(env.VITE_LIVE_UPDATE_BASE_URL, 'VITE_LIVE_UPDATE_BASE_URL', failures);
    if (ota && (productionHosts.has(ota.hostname) || ota.pathname !== '/' || ota.search)) {
      failures.push('VITE_LIVE_UPDATE_BASE_URL debe ser un origen HTTPS de staging.');
    }
  }

  return failures;
}
