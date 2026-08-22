-- Endurece el acceso público y conecta el checkout existente con sesiones QR.
-- El cliente nunca recibe el token leyendo la tabla: solo lo resuelve por RPC.
drop policy if exists restaurant_tables_public_select on public.restaurant_tables;
revoke select on public.restaurant_tables from anon, authenticated;
grant select (id, restaurant_id, table_number, status, active, created_at, updated_at)
  on public.restaurant_tables to authenticated;

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
    and s.status in ('open','payment_pending')
    and (p_table_session_id is null or s.id = p_table_session_id)
  order by s.opened_at desc
  limit 1;
  if v_session is null then
    raise exception 'active table session is required';
  end if;

  select c.order_id, c.delivery_code, c.cancel_code
    into v_order, delivery_code, cancel_code
  from public.create_cash_order(
    p_restaurant_id, p_items, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id
  ) c;

  update public.orders
  set table_id = p_table_id, table_session_id = v_session
  where id = v_order and customer_id = (select auth.uid());
  if not found then raise exception 'order association failed'; end if;
  order_id := v_order;
  return next;
end; $$;

revoke all on function public.create_table_cash_order(uuid, jsonb, text, text, text, uuid, uuid, uuid) from public;
grant execute on function public.create_table_cash_order(uuid, jsonb, text, text, text, uuid, uuid, uuid) to authenticated;

create or replace function private.refresh_table_session_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
begin
  sid := coalesce(new.table_session_id, old.table_session_id);
  if sid is not null then
    update public.table_sessions s
    set subtotal = coalesce((select sum(o.subtotal) from public.orders o where o.table_session_id = sid and o.status <> 'cancelled'), 0),
        total = coalesce((select sum(o.subtotal + o.delivery_fee - o.discount) from public.orders o where o.table_session_id = sid and o.status <> 'cancelled'), 0),
        status = case when s.status = 'open' then 'open'::public.table_session_status else s.status end
    where s.id = sid;
  end if;
  return coalesce(new, old);
end; $$;

drop trigger if exists orders_refresh_table_session_totals on public.orders;
create trigger orders_refresh_table_session_totals
  after insert or update of table_session_id, subtotal, delivery_fee, discount, status or delete
  on public.orders for each row execute function private.refresh_table_session_totals();

comment on table public.restaurant_tables is 'Mesas de restaurante. qr_token solo se resuelve mediante public.resolve_table_qr.';
