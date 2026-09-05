-- Suya Menús is a local/table ordering channel, not Suya Delivery.
-- Keep the canonical order function authoritative: menu orders do not require
-- a delivery address and never inherit the restaurant delivery fee.
do $do$
declare
  function_definition text;
  old_address_block text := $old$
  if p_origin = 'table_qr' then
    p_delivery_address := coalesce(nullif(btrim(p_delivery_address), ''), 'Consumo en mesa');
  else
    p_delivery_address := coalesce(nullif(btrim(p_delivery_address), ''), profile_row.default_address);
    if p_delivery_address is null or length(p_delivery_address) not between 5 and 300 then
      raise exception 'valid delivery address is required';
    end if;
  end if;
$old$;
  new_address_block text := $new$
  if p_origin in ('menu', 'table_qr') then
    p_delivery_address := coalesce(
      nullif(btrim(p_delivery_address), ''),
      case when p_origin = 'table_qr' then 'Consumo en mesa' else 'Pedido desde Suya Menús' end
    );
  else
    p_delivery_address := coalesce(nullif(btrim(p_delivery_address), ''), profile_row.default_address);
    if p_delivery_address is null or length(p_delivery_address) not between 5 and 300 then
      raise exception 'valid delivery address is required';
    end if;
  end if;
$new$;
  old_fee_expression text := 'case when p_origin = ''table_qr'' then 0 else restaurant_row.delivery_fee end';
  new_fee_expression text := 'case when p_origin in (''menu'', ''table_qr'') then 0 else restaurant_row.delivery_fee end';
begin
  select pg_get_functiondef(p.oid)
    into function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'create_order_internal'
    and p.proargnames[1:11] = array[
      'p_restaurant_id', 'p_items', 'p_customer_name', 'p_customer_phone',
      'p_delivery_address', 'p_delivery_reference', 'p_request_id', 'p_allow_guest',
      'p_origin', 'p_table_id', 'p_table_session_id'
    ]::text[];

  if function_definition is null then
    raise exception 'private.create_order_internal was not found';
  end if;
  if position(old_address_block in function_definition) = 0 then
    raise exception 'create_order_internal address block changed; review this migration';
  end if;
  if position(old_fee_expression in function_definition) = 0 then
    raise exception 'create_order_internal fee expression changed; review this migration';
  end if;

  function_definition := replace(function_definition, old_address_block, new_address_block);
  function_definition := replace(function_definition, old_fee_expression, new_fee_expression);
  execute function_definition;
end;
$do$;
