begin;
select plan(8);

select has_function(
  'private', 'require_payment_attempt_receiver', array[],
  'la guardia de receptor de payment_attempts existe'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']::text[]
   from pg_proc
   where oid = 'private.require_payment_attempt_receiver()'::regprocedure),
  'la guardia usa SECURITY DEFINER con search_path vacío'
);
select has_trigger(
  'public', 'payment_attempts', 'payment_attempts_receiver_integrity_guard',
  'payment_attempts valida el receptor antes de escribir'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.payment_attempts'::regclass
      and tgname = 'payment_attempts_receiver_integrity_guard'
      and not tgisinternal
      and (tgtype & 2) = 2
  ),
  'la guardia es BEFORE'
);
select ok(
  (select pg_get_functiondef('private.require_payment_attempt_receiver()'::regprocedure)
    like '%account.restaurant_id = order_row.restaurant_id%'),
  'la cuenta debe pertenecer al restaurante del pedido'
);
select ok(
  (select pg_get_functiondef('private.require_payment_attempt_receiver()'::regprocedure)
    like '%account.active%'),
  'solo se aceptan cuentas receptoras activas'
);
select ok(
  (select pg_get_triggerdef(oid) from pg_trigger
   where tgrelid = 'public.payment_attempts'::regclass
     and tgname = 'payment_attempts_receiver_integrity_guard'
     and not tgisinternal
  ) like '%INSERT OR UPDATE OF receiver_account_id, order_id%'
    or (select pg_get_triggerdef(oid) from pg_trigger
        where tgrelid = 'public.payment_attempts'::regclass
          and tgname = 'payment_attempts_receiver_integrity_guard'
          and not tgisinternal
       ) like '%INSERT OR UPDATE OF order_id, receiver_account_id%',
  'la guardia cubre inserción y cambio de orden/receptor'
);
select ok(
  not has_function_privilege(
    'authenticated', 'private.require_payment_attempt_receiver()', 'execute'
  ),
  'la guardia privada no se expone al cliente'
);

select * from finish();
rollback;
