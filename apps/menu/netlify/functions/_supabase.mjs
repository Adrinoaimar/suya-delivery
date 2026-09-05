import { createClient } from '@supabase/supabase-js';
export function supabase(event) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  return createClient(url, key, { global: { headers: { Authorization: event.headers.authorization || '' } } });
}
export const json = (body, statusCode=200) => ({ statusCode, headers: {'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'}, body: JSON.stringify(body) });
export const parse = event => { try { return JSON.parse(event.body || '{}'); } catch { return null; } };
