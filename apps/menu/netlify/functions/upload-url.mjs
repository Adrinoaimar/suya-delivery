import { createClient } from '@supabase/supabase-js';
import { supabase, json, parse } from './_supabase.mjs';
export async function handler(event) {
  if (event.httpMethod !== 'POST') return json({error:'Method not allowed'},405);
  const body = parse(event); if (!body?.storeId || !body?.fileName) return json({error:'storeId and fileName are required'},400);
  const userDb = supabase(event); const { data:{user}, error:userError } = await userDb.auth.getUser();
  if (userError || !user) return json({error:'Unauthorized'},401);
  const { data:store } = await userDb.from('menu_stores').select('id').eq('id',body.storeId).eq('owner_id',user.id).maybeSingle();
  if (!store) return json({error:'Forbidden'},403);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json({error:'SUPABASE_SERVICE_ROLE_KEY is required for uploads'},503);
  const admin = createClient(process.env.SUPABASE_URL, serviceKey);
  const safe = String(body.fileName).toLowerCase().replace(/[^a-z0-9._-]/g,'-').slice(-120);
  const path = `${store.id}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await admin.storage.from(process.env.SUPABASE_MENU_BUCKET || 'menu-images').createSignedUploadUrl(path);
  if (error) return json({error:error.message},500);
  return json({path, token:data.token, bucket:process.env.SUPABASE_MENU_BUCKET || 'menu-images'});
}
