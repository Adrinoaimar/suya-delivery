import { supabase, json, parse } from './_supabase.mjs';
const allowed = new Set(['menu_stores','menu_categories','menu_items','menu_promotions','menu_coupons']);
export async function handler(event) {
  if (event.httpMethod==='OPTIONS') return json({},204);
  const table = event.queryStringParameters?.table; if (!allowed.has(table)) return json({error:'Invalid table'},400);
  const db = supabase(event); const body = parse(event); let result;
  if (event.httpMethod==='GET') result = await db.from(table).select('*').order('created_at',{ascending:false});
  else if (event.httpMethod==='POST') result = await db.from(table).insert(body || {}).select().single();
  else if (event.httpMethod==='PATCH') { if (!body?.id) return json({error:'id is required'},400); const {id,...changes}=body; result=await db.from(table).update(changes).eq('id',id).select().single(); }
  else if (event.httpMethod==='DELETE') { const id=event.queryStringParameters?.id; if (!id) return json({error:'id is required'},400); result=await db.from(table).delete().eq('id',id); }
  else return json({error:'Method not allowed'},405);
  if (result.error) return json({error:result.error.message},400); return json({data:result.data});
}
