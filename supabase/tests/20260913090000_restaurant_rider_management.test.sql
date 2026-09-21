begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

select has_table('public', 'restaurant_riders', 'existe el vínculo por cuenta de restaurante');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.restaurant_riders'::regclass),
  'el vínculo de repartidores usa RLS'
);
select has_function('public', 'list_restaurant_riders', array['uuid'], 'RPC de listado por cuenta existe');
select has_function('public', 'set_restaurant_rider_active', array['uuid', 'uuid', 'boolean'], 'RPC de habilitación existe');
select ok(
  pg_catalog.has_function_privilege('authenticated', 'public.list_restaurant_riders(uuid)', 'EXECUTE')
  and pg_catalog.has_function_privilege('authenticated', 'public.set_restaurant_rider_active(uuid,uuid,boolean)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'public.list_restaurant_riders(uuid)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'public.set_restaurant_rider_active(uuid,uuid,boolean)', 'EXECUTE'),
  'solo authenticated ejecuta la gestión de repartidores'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.restaurant_riders', 'SELECT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.restaurant_riders', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.restaurant_riders', 'UPDATE'),
  'la tabla de vínculos no se modifica directamente desde el cliente'
);
select ok(
  (select prosecdef from pg_catalog.pg_proc where oid = 'public.list_restaurant_riders(uuid)'::regprocedure)
  and (select prosecdef from pg_catalog.pg_proc where oid = 'public.set_restaurant_rider_active(uuid,uuid,boolean)'::regprocedure),
  'RPC de gestión usa SECURITY DEFINER'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid = 'public.list_restaurant_riders(uuid)'::regprocedure)
  and (select proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid = 'public.set_restaurant_rider_active(uuid,uuid,boolean)'::regprocedure),
  'RPC de gestión fija search_path vacío'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.restaurant_riders'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_catalog.pg_attribute where attrelid = 'public.restaurant_riders'::regclass and attname = 'restaurant_id'),
        (select attnum from pg_catalog.pg_attribute where attrelid = 'public.restaurant_riders'::regclass and attname = 'rider_id')
      ]::smallint[]
  ),
  'una cuenta no duplica el mismo repartidor'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_proc
    where oid = 'public.list_available_riders(uuid)'::regprocedure
      and prosrc like '%restaurant_riders%'
  ),
  'la disponibilidad consulta el vínculo de la cuenta'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_proc
    where oid = 'public.assign_order_rider(uuid,uuid)'::regprocedure
      and prosrc like '%not assigned to restaurant%'
  ),
  'la asignación rechaza riders fuera de la cuenta'
);

select * from finish();
rollback;
