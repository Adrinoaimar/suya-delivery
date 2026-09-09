create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select has_table('public', 'app_offers', 'tabla de ofertas exclusivas existe');
select has_table('private', 'app_offer_redemptions', 'redenciones de ofertas permanecen privadas');
select has_column('public', 'app_offers', 'app_only', 'oferta conserva marca exclusiva de app');
select has_column('public', 'app_offers', 'redeemed_count', 'oferta controla usos consumidos');
select has_index('public', 'app_offers', 'app_offers_active_window_idx', 'ofertas activas tienen índice parcial');

select has_function(
  'private', 'apply_app_offer', array['uuid', 'text'],
  'helper de oferta existe'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'private.apply_app_offer(uuid,text)'::pg_catalog.regprocedure),
  'helper de oferta es SECURITY DEFINER con search_path vacío'
);
select ok(
  not has_table_privilege('authenticated', 'private.app_offer_redemptions', 'SELECT')
  and not has_table_privilege('anon', 'private.app_offer_redemptions', 'SELECT'),
  'redenciones no son legibles directamente'
);
select ok(
  has_table_privilege('anon', 'public.app_offers', 'SELECT')
  and has_table_privilege('authenticated', 'public.app_offers', 'SELECT'),
  'clientes pueden consultar ofertas publicadas mediante RLS'
);

select has_function(
  'public', 'create_cash_order', array['uuid','jsonb','text','text','text','uuid','text'],
  'Delivery tiene RPC con oferta'
);
select has_function(
  'public', 'create_menu_order_with_customer', array['uuid','jsonb','text','text','text','text','uuid','text'],
  'Menús tiene RPC con oferta'
);
select has_function(
  'public', 'create_table_cash_order_with_customer', array['uuid','jsonb','text','text','text','text','uuid','uuid','uuid','text'],
  'Mesa QR tiene RPC con oferta'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc where oid = 'public.create_cash_order(uuid,jsonb,text,text,text,uuid,text)'::pg_catalog.regprocedure),
  'RPC Delivery con oferta es SECURITY DEFINER'
);
select ok(
  has_function_privilege('authenticated', 'public.create_cash_order(uuid,jsonb,text,text,text,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.create_cash_order(uuid,jsonb,text,text,text,uuid,text)', 'execute'),
  'RPC Delivery con oferta queda cerrada a anon'
);
select ok(
  has_function_privilege('anon', 'public.create_menu_order_with_customer(uuid,jsonb,text,text,text,text,uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_menu_order_with_customer(uuid,jsonb,text,text,text,text,uuid,text)', 'execute'),
  'RPC Menús con oferta conserva acceso guest'
);
select ok(
  has_function_privilege('anon', 'public.create_table_cash_order_with_customer(uuid,jsonb,text,text,text,text,uuid,uuid,uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_table_cash_order_with_customer(uuid,jsonb,text,text,text,text,uuid,uuid,uuid,text)', 'execute'),
  'RPC Mesa QR con oferta conserva acceso guest'
);
select ok(
  (select pg_get_functiondef('private.apply_app_offer(uuid,text)'::pg_catalog.regprocedure) like '%redeemed_count%'
    and pg_get_functiondef('private.apply_app_offer(uuid,text)'::pg_catalog.regprocedure) like '%for update%'),
  'helper bloquea oferta y actualiza contador de redenciones'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_offers'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%discount_type%'
  ),
  'ofertas restringen tipo de descuento'
);

select * from finish();
rollback;
