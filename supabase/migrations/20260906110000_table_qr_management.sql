-- Operación administrativa de mesas: el token QR nunca se acepta desde cliente.
-- Las funciones validan membresía antes de crear, rotar o desactivar una mesa.

alter table public.orders drop constraint if exists orders_origin_check;
alter table public.orders add constraint orders_origin_check
  check (origin in ('delivery', 'menu', 'table_qr'));

create or replace function public.create_restaurant_table(
  p_restaurant_id uuid,
  p_table_number text
)
returns table (table_id uuid, restaurant_id uuid, table_number text, qr_token text, status public.table_status, active boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_table public.restaurant_tables%rowtype;
  v_number text := btrim(coalesce(p_table_number, ''));
begin
  if not private.has_restaurant_role(p_restaurant_id, array['owner','manager']::public.restaurant_role[])
     and not private.is_platform_admin() then
    raise exception 'restaurant management role required';
  end if;
  if length(v_number) < 1 or length(v_number) > 30 then
    raise exception 'table number must contain 1 to 30 characters';
  end if;

  insert into public.restaurant_tables (restaurant_id, table_number, qr_token)
  values (p_restaurant_id, v_number, encode(gen_random_bytes(18), 'hex'))
  returning * into v_table;

  return query select v_table.id, v_table.restaurant_id, v_table.table_number,
    v_table.qr_token, v_table.status, v_table.active;
exception
  when unique_violation then
    raise exception 'table number already exists';
end;
$$;

create or replace function public.regenerate_restaurant_table_qr(p_table_id uuid)
returns table (table_id uuid, restaurant_id uuid, table_number text, qr_token text, status public.table_status, active boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_table public.restaurant_tables%rowtype;
begin
  select * into v_table
  from public.restaurant_tables
  where id = p_table_id
  for update;
  if not found then raise exception 'table not found'; end if;
  if not private.has_restaurant_role(v_table.restaurant_id, array['owner','manager']::public.restaurant_role[])
     and not private.is_platform_admin() then
    raise exception 'restaurant management role required';
  end if;

  update public.restaurant_tables
  set qr_token = encode(gen_random_bytes(18), 'hex')
  where id = p_table_id
  returning * into v_table;
  return query select v_table.id, v_table.restaurant_id, v_table.table_number,
    v_table.qr_token, v_table.status, v_table.active;
end;
$$;

create or replace function public.set_restaurant_table_active(p_table_id uuid, p_active boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.restaurant_tables where id = p_table_id for update;
  if v_restaurant is null then raise exception 'table not found'; end if;
  if not private.has_restaurant_role(v_restaurant, array['owner','manager']::public.restaurant_role[])
     and not private.is_platform_admin() then
    raise exception 'restaurant management role required';
  end if;
  update public.restaurant_tables set active = coalesce(p_active, false), status =
    case when coalesce(p_active, false) then status else 'available'::public.table_status end
  where id = p_table_id;
  return true;
end;
$$;

create or replace function public.list_restaurant_tables(p_restaurant_ids uuid[])
returns table (table_id uuid, restaurant_id uuid, table_number text, qr_token text, status public.table_status, active boolean, session_id uuid, session_status public.table_session_status, total numeric)
language sql security definer set search_path = '' stable as $$
  select t.id, t.restaurant_id, t.table_number, t.qr_token, t.status, t.active,
    s.id, s.status, coalesce(s.total, 0)
  from public.restaurant_tables t
  left join lateral (
    select ts.id, ts.status, ts.total
    from public.table_sessions ts
    where ts.table_id = t.id and ts.status in ('open', 'payment_pending')
    order by ts.opened_at desc
    limit 1
  ) s on true
  where t.restaurant_id = any(coalesce(p_restaurant_ids, '{}'::uuid[]))
    and (private.has_restaurant_role(t.restaurant_id, array['owner','manager','kitchen']::public.restaurant_role[])
      or private.is_platform_admin())
  order by t.restaurant_id, t.table_number;
$$;

-- Mesa/table QR debe permanecer identificable en operaciones.
create or replace function public.create_table_cash_order(
  p_restaurant_id uuid,
  p_items jsonb,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_reference text,
  p_request_id uuid,
  p_table_id uuid,
  p_table_session_id uuid default null
)
returns table (order_id uuid, delivery_code text, cancel_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid;
  v_order uuid;
begin
  if p_table_id is null then raise exception 'table is required'; end if;
  select s.id into v_session
  from public.table_sessions s
  join public.restaurant_tables t on t.id = s.table_id
  where s.table_id = p_table_id
    and s.restaurant_id = p_restaurant_id
    and t.active
    and s.status in ('open','payment_pending')
    and (p_table_session_id is null or s.id = p_table_session_id)
  order by s.opened_at desc
  limit 1;
  if v_session is null then raise exception 'active table session is required'; end if;

  select c.order_id, c.delivery_code, c.cancel_code
    into v_order, delivery_code, cancel_code
  from public.create_cash_order(
    p_restaurant_id, p_items, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id
  ) c;
  update public.orders
  set table_id = p_table_id, table_session_id = v_session, origin = 'table_qr'
  where id = v_order and customer_id = (select auth.uid());
  if not found then raise exception 'order association failed'; end if;
  order_id := v_order;
  return next;
end;
$$;

revoke all on function public.create_restaurant_table(uuid, text) from public;
revoke all on function public.regenerate_restaurant_table_qr(uuid) from public;
revoke all on function public.set_restaurant_table_active(uuid, boolean) from public;
revoke all on function public.list_restaurant_tables(uuid[]) from public;
revoke all on function public.create_table_cash_order(uuid, jsonb, text, text, text, uuid, uuid, uuid) from public;
grant execute on function public.create_restaurant_table(uuid, text) to authenticated;
grant execute on function public.regenerate_restaurant_table_qr(uuid) to authenticated;
grant execute on function public.set_restaurant_table_active(uuid, boolean) to authenticated;
grant execute on function public.list_restaurant_tables(uuid[]) to authenticated;
grant execute on function public.create_table_cash_order(uuid, jsonb, text, text, text, uuid, uuid, uuid) to authenticated;

comment on function public.create_restaurant_table(uuid, text) is 'Creates one restaurant table and server-generated public QR token for authorized staff.';
comment on function public.regenerate_restaurant_table_qr(uuid) is 'Rotates one table QR token for authorized restaurant staff.';
comment on function public.list_restaurant_tables(uuid[]) is 'Lists table operations, including QR token, only for authorized restaurant staff.';
comment on column public.orders.origin is 'Order acquisition channel; server-controlled: delivery, menu, or table_qr.';
