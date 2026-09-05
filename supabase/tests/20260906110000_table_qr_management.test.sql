begin;
select plan(13);

select has_function('public', 'create_restaurant_table', array['uuid','text'], 'admin create table RPC exists');
select has_function('public', 'regenerate_restaurant_table_qr', array['uuid'], 'admin rotate QR RPC exists');
select has_function('public', 'set_restaurant_table_active', array['uuid','boolean'], 'admin active RPC exists');
select has_function('public', 'list_restaurant_tables', array['uuid[]'], 'admin list RPC exists');
select is((select p.prosecdef from pg_proc p where p.oid='public.create_restaurant_table(uuid,text)'::regprocedure), true, 'create table RPC is security definer');
select is((select p.prosecdef from pg_proc p where p.oid='public.list_restaurant_tables(uuid[])'::regprocedure), true, 'list tables RPC is security definer');
select is_empty($$select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_restaurant_table','regenerate_restaurant_table_qr','set_restaurant_table_active','list_restaurant_tables') and has_function_privilege('anon',p.oid,'execute')$$, 'anon cannot execute admin table RPCs');
select ok(has_function_privilege('authenticated','public.create_restaurant_table(uuid,text)','execute'), 'authenticated can create table via RPC');
select ok(has_function_privilege('authenticated','public.regenerate_restaurant_table_qr(uuid)','execute'), 'authenticated can rotate QR via RPC');
select ok(has_function_privilege('authenticated','public.set_restaurant_table_active(uuid,boolean)','execute'), 'authenticated can toggle table via RPC');
select ok(has_function_privilege('authenticated','public.list_restaurant_tables(uuid[])','execute'), 'authenticated can list tables via RPC');
select ok(has_function_privilege('authenticated','public.create_table_cash_order(uuid,jsonb,text,text,text,uuid,uuid,uuid)','execute'), 'authenticated can create table order via RPC');
select ok((select pg_get_constraintdef(oid) like '%table_qr%' from pg_constraint where conrelid='public.orders'::regclass and conname='orders_origin_check'), 'table_qr origin is allowed by server constraint');
select * from finish();
rollback;
