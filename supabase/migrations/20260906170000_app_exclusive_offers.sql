-- Ofertas exclusivas del APK. La tabla es legible públicamente solo para ofertas vigentes;
-- el importe definitivo se calcula dentro de la RPC de creación del pedido.
create table public.app_offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 120),
  description text not null default '' check (length(description) <= 500),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9-]{3,30}$'),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  minimum_subtotal numeric(10,2) not null default 0 check (minimum_subtotal >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  app_only boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (discount_type <> 'percent' or discount_value <= 100)
);

create index app_offers_active_window_idx
  on public.app_offers (starts_at, ends_at)
  where app_only and is_active;

create table private.app_offer_redemptions (
  offer_id uuid not null references public.app_offers(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  primary key (offer_id, order_id),
  unique (order_id)
);

alter table public.app_offers enable row level security;
alter table private.app_offer_redemptions enable row level security;

create policy app_offers_public_active_select on public.app_offers
  for select to anon, authenticated
  using (app_only and is_active and starts_at <= now() and ends_at > now());

create policy app_offers_staff_select on public.app_offers
  for select to authenticated
  using (
    private.is_platform_admin()
    or private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.restaurant_role[])
  );

create policy app_offers_staff_insert on public.app_offers
  for insert to authenticated
  with check (
    (restaurant_id is not null and private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.restaurant_role[]))
    or (restaurant_id is null and private.is_platform_admin())
  );

create policy app_offers_staff_update on public.app_offers
  for update to authenticated
  using (
    private.is_platform_admin()
    or private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.restaurant_role[])
  )
  with check (
    (restaurant_id is not null and private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.restaurant_role[]))
    or (restaurant_id is null and private.is_platform_admin())
  );

revoke all on table private.app_offer_redemptions from public, anon, authenticated;
grant select on table public.app_offers to anon, authenticated;
grant insert, update on table public.app_offers to authenticated;

-- Aplicación atómica y reintentable: bloquea la oferta y el pedido, calcula en servidor y
-- registra una sola redención por pedido. El cliente nunca envía el descuento como verdad.
create or replace function private.apply_app_offer(target_order uuid, offer_code text)
returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  order_row public.orders%rowtype;
  offer_row public.app_offers%rowtype;
  existing_offer uuid;
  existing_code text;
  calculated_discount numeric(10,2);
begin
  if nullif(btrim(offer_code), '') is null then return 0; end if;

  select * into order_row from public.orders where id = target_order for update;
  if not found then raise exception 'order unavailable'; end if;

  select r.offer_id into existing_offer
  from private.app_offer_redemptions r
  where r.order_id = target_order;
  if existing_offer is not null then
    select o.code into existing_code from public.app_offers o where o.id = existing_offer;
    if existing_code <> upper(btrim(offer_code)) then raise exception 'different offer already applied'; end if;
    return order_row.discount;
  end if;

  select * into offer_row
  from public.app_offers o
  where o.code = upper(btrim(offer_code))
    and o.app_only and o.is_active
    and o.starts_at <= now() and o.ends_at > now()
  for update;
  if not found then raise exception 'offer unavailable'; end if;
  if offer_row.restaurant_id is not null and offer_row.restaurant_id <> order_row.restaurant_id then
    raise exception 'offer does not apply to this restaurant';
  end if;
  if order_row.subtotal < offer_row.minimum_subtotal then raise exception 'minimum subtotal for offer not reached'; end if;
  if offer_row.max_redemptions is not null and offer_row.redeemed_count >= offer_row.max_redemptions then
    raise exception 'offer redemption limit reached';
  end if;

  calculated_discount := case offer_row.discount_type
    when 'percent' then round(order_row.subtotal * offer_row.discount_value / 100, 2)
    else least(offer_row.discount_value, order_row.subtotal + order_row.delivery_fee)
  end;
  calculated_discount := least(calculated_discount, order_row.subtotal + order_row.delivery_fee);

  insert into private.app_offer_redemptions (offer_id, order_id, customer_id)
  values (offer_row.id, target_order, order_row.customer_id);
  update public.app_offers
  set redeemed_count = redeemed_count + 1, updated_at = now()
  where id = offer_row.id;
  update public.orders set discount = calculated_discount where id = target_order;
  return calculated_discount;
end;
$$;

-- Overloads preserve las RPC existentes y solo se seleccionan cuando el cliente envía p_offer_code.
create function public.create_cash_order(
  p_restaurant_id uuid, p_items jsonb, p_customer_phone text, p_delivery_address text,
  p_delivery_reference text, p_request_id uuid, p_offer_code text
)
returns table (order_id uuid, delivery_code text, cancel_code text)
language plpgsql security definer set search_path = '' as $$
declare result record;
begin
  select * into result from private.create_order_internal(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, false, 'delivery', null, null
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  return query select result.order_id, result.delivery_code, result.cancel_code;
end;
$$;

create function public.create_menu_order_with_customer(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid, p_offer_code text
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare result record;
begin
  if not exists (
    select 1 from public.restaurant_menu_settings m
    join public.restaurants r on r.id = m.restaurant_id
    where m.restaurant_id = p_restaurant_id and m.published and r.active
  ) then raise exception 'menu is unavailable'; end if;
  select * into result from private.create_order_internal(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'menu', null, null
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create function public.create_table_cash_order_with_customer(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid,
  p_table_id uuid, p_table_session_id uuid default null, p_offer_code text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid;
  result record;
begin
  if p_table_id is null then raise exception 'table is required'; end if;
  select s.id into v_session
  from public.table_sessions s
  join public.restaurant_tables t on t.id = s.table_id
  where s.table_id = p_table_id and s.restaurant_id = p_restaurant_id and t.active
    and s.status in ('open','payment_pending')
    and (p_table_session_id is null or s.id = p_table_session_id)
  order by s.opened_at desc limit 1;
  if v_session is null then raise exception 'active table session is required'; end if;
  select * into result from private.create_order_internal(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'table_qr', p_table_id, v_session
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

revoke all on function private.apply_app_offer(uuid, text) from public, anon, authenticated;
revoke all on function public.create_cash_order(uuid, jsonb, text, text, text, uuid, text) from public, anon;
grant execute on function public.create_cash_order(uuid, jsonb, text, text, text, uuid, text) to authenticated;
revoke all on function public.create_menu_order_with_customer(uuid, jsonb, text, text, text, text, uuid, text) from public;
grant execute on function public.create_menu_order_with_customer(uuid, jsonb, text, text, text, text, uuid, text) to anon, authenticated;
revoke all on function public.create_table_cash_order_with_customer(uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text) from public;
grant execute on function public.create_table_cash_order_with_customer(uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text) to anon, authenticated;

comment on table public.app_offers is 'Ofertas exclusivas para la experiencia móvil Suya; precio final validado por RPC.';
