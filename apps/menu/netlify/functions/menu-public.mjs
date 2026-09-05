import { supabase, json } from './_supabase.mjs';
export async function handler(event) {
  const slug = event.queryStringParameters?.slug;
  if (!slug) return json({error:'slug is required'},400);
  const db = supabase(event);
  const { data: store, error } = await db.from('menu_stores').select('id,name,logo_url,primary_color,accent_color,font_family').eq('slug',slug).eq('is_published',true).maybeSingle();
  if (error) return json({error:error.message},500); if (!store) return json({error:'Menu not found'},404);
  const [categories, items, promotions] = await Promise.all([
    db.from('menu_categories').select('id,name,sort_order').eq('store_id',store.id).eq('is_active',true).order('sort_order'),
    db.from('menu_items').select('id,category_id,name,description,price,image_url,sort_order').eq('store_id',store.id).eq('is_available',true).order('sort_order'),
    db.from('menu_promotions').select('id,title,description,discount_percent,starts_at,ends_at').eq('store_id',store.id).eq('is_active',true).order('created_at',{ascending:false})
  ]);
  if (categories.error || items.error || promotions.error) return json({error:'Could not load menu'},500);
  return json({store,categories:categories.data,items:items.data,promotions:promotions.data});
}
