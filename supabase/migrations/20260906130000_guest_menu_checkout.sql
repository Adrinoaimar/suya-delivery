-- Guest checkout pertenece únicamente a Suya Menús y Mesa QR.
-- Delivery conserva create_cash_order autenticado.

alter table public.orders
  alter column customer_id drop not null;

alter table private.order_secrets
  add column if not exists guest_access_token_hash text;

create unique index if not exists orders_guest_idempotency_unique
  on public.orders (restaurant_id, origin, idempotency_key)
  where customer_id is null;

-- The helper is private so clients can never choose a channel or bypass auth.
create or replace function private.create_order_internal(
  p_restaurant_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_reference text,
  p_request_id uuid,
  p_allow_guest boolean,
  p_origin text,
  p_table_id uuid default null,
  p_table_session_id uuid default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  profile_row public.profiles%rowtype;
  restaurant_row public.restaurants%rowtype;
  product_row public.products%rowtype;
  item jsonb;
  extra_ids jsonb;
  canonical_extras jsonb;
  canonical_lines jsonb := '[]'::jsonb;
  selected_count integer;
  distinct_count integer;
  matched_count integer;
  quantity integer;
  note text;
  extras_total numeric(10,2);
  unit_price numeric(10,2);
  calculated_subtotal numeric(10,2) := 0;
  created_order_id uuid;
  created_delivery_code text;
  created_cancel_code text;
  existing_order_id uuid;
  created_guest_access_token text;
  guest_access_token_hash text;
begin
  if p_origin not in ('delivery', 'menu', 'table_qr') then
    raise exception 'invalid order origin';
  end if;
  if p_origin = 'delivery' and actor_id is null then
    raise exception 'authentication required';
  end if;
  if actor_id is null and not p_allow_guest then
    raise exception 'authentication required';
  end if;
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'items must contain between 1 and 50 lines';
  end if;

  if actor_id is not null then
    select * into profile_row from public.profiles where id = actor_id;
    if not found and p_origin = 'delivery' then raise exception 'customer profile is required'; end if;
  end if;

  p_customer_name := coalesce(
    nullif(btrim(p_customer_name), ''),
    nullif(btrim(profile_row.display_name), ''),
    'Cliente invitado'
  );
  if length(p_customer_name) not between 2 and 120 then
    raise exception 'valid customer name is required';
  end if;

  p_customer_phone := coalesce(nullif(btrim(p_customer_phone), ''), profile_row.phone);
  if p_customer_phone is null or p_customer_phone !~ '^\+?[0-9 ()-]{6,20}$' then
    raise exception 'valid customer phone is required';
  end if;

  if p_origin = 'table_qr' then
    p_delivery_address := coalesce(nullif(btrim(p_delivery_address), ''), 'Consumo en mesa');
  else
    p_delivery_address := coalesce(nullif(btrim(p_delivery_address), ''), profile_row.default_address);
    if p_delivery_address is null or length(p_delivery_address) not between 5 and 300 then
      raise exception 'valid delivery address is required';
    end if;
  end if;
  p_delivery_reference := coalesce(btrim(p_delivery_reference), '');
  if length(p_delivery_reference) > 300 then raise exception 'delivery reference is too long'; end if;

  select o.id into existing_order_id
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.idempotency_key = p_request_id
    and (
      (actor_id is not null and o.customer_id = actor_id)
      or (actor_id is null and o.customer_id is null and o.origin = p_origin)
    );
  if found then
    return query
      select existing_order_id, s.delivery_code, s.cancel_code, null::text
      from private.order_secrets s where s.order_id = existing_order_id;
    return;
  end if;

  select * into restaurant_row
  from public.restaurants r
  where r.id = p_restaurant_id
  for share;
  if not found or not restaurant_row.active then raise exception 'restaurant is unavailable'; end if;
  if not restaurant_row.accepting_orders then raise exception 'restaurant is not accepting orders'; end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object' then raise exception 'invalid order line'; end if;
    begin
      product_row.id := (item ->> 'product_id')::uuid;
      quantity := (item ->> 'quantity')::integer;
    exception when others then
      raise exception 'invalid product or quantity';
    end;
    if quantity not between 1 and 99 then raise exception 'quantity out of range'; end if;
    note := coalesce(btrim(item ->> 'note'), '');
    if length(note) > 300 then raise exception 'item note is too long'; end if;

    select * into product_row
    from public.products p
    where p.id = product_row.id and p.restaurant_id = p_restaurant_id and p.active
    for share;
    if not found then raise exception 'product is unavailable'; end if;

    extra_ids := coalesce(item -> 'extra_ids', '[]'::jsonb);
    if jsonb_typeof(extra_ids) <> 'array' then raise exception 'extra_ids must be an array'; end if;
    select count(*), count(distinct value)
      into selected_count, distinct_count
    from jsonb_array_elements_text(extra_ids);
    if selected_count <> distinct_count then raise exception 'duplicate extra'; end if;

    select
      coalesce(jsonb_agg(
        jsonb_build_object('id', source.value ->> 'id', 'label', source.value ->> 'label',
          'price', (source.value ->> 'price')::numeric)
        order by source.ordinality
      ), '[]'::jsonb),
      coalesce(sum((source.value ->> 'price')::numeric), 0),
      count(*)
    into canonical_extras, extras_total, matched_count
    from jsonb_array_elements(product_row.extras) with ordinality as source(value, ordinality)
    where source.value ->> 'id' in (select value from jsonb_array_elements_text(extra_ids));

    if matched_count <> selected_count then raise exception 'unknown extra'; end if;
    if extras_total < 0 then raise exception 'invalid extra price'; end if;
    unit_price := product_row.price + extras_total;
    calculated_subtotal := calculated_subtotal + unit_price * quantity;
    canonical_lines := canonical_lines || jsonb_build_array(jsonb_build_object(
      'product_id', product_row.id,
      'product_name', product_row.name,
      'unit_price', product_row.price,
      'extras_total', extras_total,
      'quantity', quantity,
      'extras', canonical_extras,
      'note', note,
      'image_url', product_row.image_url
    ));
  end loop;

  if calculated_subtotal < restaurant_row.minimum_order then
    raise exception 'minimum order not reached';
  end if;

  created_delivery_code := private.four_digit_code();
  loop
    created_cancel_code := private.four_digit_code();
    exit when created_cancel_code <> created_delivery_code;
  end loop;

  if actor_id is null then
    created_guest_access_token := encode(extensions.gen_random_bytes(32), 'hex');
    guest_access_token_hash := extensions.crypt(created_guest_access_token, extensions.gen_salt('bf'));
  end if;

  insert into public.orders (
    code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee, discount,
    customer_name, customer_phone, delivery_address, delivery_reference, estimated_minutes,
    idempotency_key, origin, table_id, table_session_id
  ) values (
    upper(encode(extensions.gen_random_bytes(5), 'hex')), actor_id, p_restaurant_id, 'confirmed',
    'cash', calculated_subtotal,
    case when p_origin = 'table_qr' then 0 else restaurant_row.delivery_fee end,
    0, p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    restaurant_row.eta_max_minutes, p_request_id, p_origin, p_table_id, p_table_session_id
  ) returning id into created_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, unit_price, extras_total, quantity, extras, note, image_url
  )
  select created_order_id, line.product_id, line.product_name, line.unit_price, line.extras_total,
    line.quantity, line.extras, line.note, line.image_url
  from jsonb_to_recordset(canonical_lines) as line(
    product_id uuid, product_name text, unit_price numeric, extras_total numeric, quantity integer,
    extras jsonb, note text, image_url text
  );

  insert into private.order_secrets (
    order_id, delivery_code_hash, cancel_code_hash, delivery_code, cancel_code, guest_access_token_hash
  ) values (
    created_order_id,
    extensions.crypt(created_delivery_code, extensions.gen_salt('bf')),
    extensions.crypt(created_cancel_code, extensions.gen_salt('bf')),
    created_delivery_code, created_cancel_code, guest_access_token_hash
  );

  return query select created_order_id, created_delivery_code, created_cancel_code, created_guest_access_token;
exception
  when unique_violation then
    select o.id into existing_order_id
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and o.idempotency_key = p_request_id
      and (
        (actor_id is not null and o.customer_id = actor_id)
        or (actor_id is null and o.customer_id is null and o.origin = p_origin)
      );
    if existing_order_id is null then raise; end if;
    return query
      select existing_order_id, s.delivery_code, s.cancel_code, null::text
      from private.order_secrets s where s.order_id = existing_order_id;
end;
$$;

revoke all on function private.create_order_internal(uuid, jsonb, text, text, text, text, uuid, boolean, text, uuid, uuid) from public, anon, authenticated;

-- Delivery wrapper remains account-only and keeps original API shape.
create or replace function public.create_cash_order(
  p_restaurant_id uuid,
  p_items jsonb,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_reference text,
  p_request_id uuid
)
returns table (order_id uuid, delivery_code text, cancel_code text)
language plpgsql security definer set search_path = '' as $$
declare result record;
begin
  select * into result from private.create_order_internal(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, false, 'delivery', null, null
  );
  return query select result.order_id, result.delivery_code, result.cancel_code;
end;
$$;

-- Existing menu API now supports anonymous checkout. Customer-aware variant avoids
-- losing the name collected by the public menu checkout form.
drop function if exists public.create_menu_order(uuid, jsonb, text, text, text, uuid);
create function public.create_menu_order(
  p_restaurant_id uuid,
  p_items jsonb,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_reference text,
  p_request_id uuid
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
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'menu', null, null
  );
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create or replace function public.create_menu_order_with_customer(
  p_restaurant_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_reference text,
  p_request_id uuid
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
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

-- QR table checkout supports guests after a valid table session exists. A guest
-- session is opened only with the server-resolved QR token below.
drop function if exists public.create_table_cash_order(uuid, jsonb, text, text, text, uuid, uuid, uuid);
create function public.create_table_cash_order(
  p_restaurant_id uuid,
  p_items jsonb,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_reference text,
  p_request_id uuid,
  p_table_id uuid,
  p_table_session_id uuid default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  v_session uuid;
  result record;
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

  select * into result from private.create_order_internal(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'table_qr', p_table_id, v_session
  );
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create function public.create_table_cash_order_with_customer(
  p_restaurant_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_reference text,
  p_request_id uuid,
  p_table_id uuid,
  p_table_session_id uuid default null
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
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

-- Guest QR scan can create/open one session only after presenting QR token.
create or replace function public.open_guest_table_session(p_token text)
returns table (session_id uuid, table_id uuid, restaurant_id uuid, table_number text)
language plpgsql security definer set search_path = '' as $$
declare
  table_row public.restaurant_tables%rowtype;
  v_session uuid;
begin
  select t.* into table_row
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id and r.active
  where t.qr_token = btrim(coalesce(p_token, '')) and t.active
  for update;
  if not found then raise exception 'table unavailable'; end if;

  select s.id into v_session
  from public.table_sessions s
  where s.table_id = table_row.id and s.status in ('open','payment_pending')
  order by s.opened_at desc limit 1;
  if v_session is null then
    insert into public.table_sessions (restaurant_id, table_id, opened_by)
    values (table_row.restaurant_id, table_row.id, (select auth.uid()))
    returning id into v_session;
    update public.restaurant_tables set status = 'occupied' where id = table_row.id;
  end if;
  return query select v_session, table_row.id, table_row.restaurant_id, table_row.table_number;
end;
$$;

-- Token-gated read endpoint lets anonymous menu/table customers track their order.
create or replace function public.get_guest_order(p_order_id uuid, p_access_token text)
returns table (
  order_id uuid, code text, restaurant_id uuid, origin text, status public.order_status,
  table_id uuid, table_session_id uuid, customer_name text, customer_phone text,
  delivery_address text, delivery_reference text, subtotal numeric, delivery_fee numeric,
  discount numeric, total numeric, estimated_minutes integer, created_at timestamptz,
  cancellation_reason text, delivery_code text, cancel_code text, items jsonb, events jsonb
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.code, o.restaurant_id, o.origin, o.status, o.table_id, o.table_session_id,
    o.customer_name, o.customer_phone, o.delivery_address, o.delivery_reference,
    o.subtotal, o.delivery_fee, o.discount, o.total, o.estimated_minutes, o.created_at,
    o.cancellation_reason, s.delivery_code, s.cancel_code,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'product_id', i.product_id, 'product_name', i.product_name,
      'unit_price', i.unit_price, 'quantity', i.quantity, 'extras', i.extras,
      'note', i.note, 'image_url', i.image_url) order by i.id)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'created_at', e.created_at)
      order by e.created_at) from public.order_events e where e.order_id = o.id), '[]'::jsonb)
  from public.orders o
  join private.order_secrets s on s.order_id = o.id
  where o.id = p_order_id and o.customer_id is null and o.origin in ('menu','table_qr')
    and p_access_token is not null and length(p_access_token) between 32 and 128
    and s.guest_access_token_hash is not null
    and extensions.crypt(p_access_token, s.guest_access_token_hash) = s.guest_access_token_hash;
$$;

create or replace function public.set_guest_order_delivery_coordinates(
  p_order_id uuid,
  p_access_token text,
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare matched boolean;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid delivery coordinates';
  end if;
  select exists (
    select 1 from public.orders o
    join private.order_secrets s on s.order_id = o.id
    where o.id = p_order_id and o.customer_id is null and o.origin in ('menu','table_qr')
      and p_access_token is not null and length(p_access_token) between 32 and 128
      and s.guest_access_token_hash is not null
      and extensions.crypt(p_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
  ) into matched;
  if not matched then return false; end if;
  update public.orders set delivery_latitude = p_latitude, delivery_longitude = p_longitude
  where id = p_order_id;
  return true;
end;
$$;

revoke all on function public.create_cash_order(uuid, jsonb, text, text, text, uuid) from public, anon;
grant execute on function public.create_cash_order(uuid, jsonb, text, text, text, uuid) to authenticated;

revoke all on function public.create_menu_order(uuid, jsonb, text, text, text, uuid) from public;
revoke all on function public.create_menu_order_with_customer(uuid, jsonb, text, text, text, text, uuid) from public;
grant execute on function public.create_menu_order(uuid, jsonb, text, text, text, uuid) to anon, authenticated;
grant execute on function public.create_menu_order_with_customer(uuid, jsonb, text, text, text, text, uuid) to anon, authenticated;

revoke all on function public.create_table_cash_order(uuid, jsonb, text, text, text, uuid, uuid, uuid) from public;
revoke all on function public.create_table_cash_order_with_customer(uuid, jsonb, text, text, text, text, uuid, uuid, uuid) from public;
grant execute on function public.create_table_cash_order(uuid, jsonb, text, text, text, uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.create_table_cash_order_with_customer(uuid, jsonb, text, text, text, text, uuid, uuid, uuid) to anon, authenticated;

revoke all on function public.open_guest_table_session(text) from public;
grant execute on function public.open_guest_table_session(text) to anon, authenticated;
revoke all on function public.get_guest_order(uuid, text) from public;
grant execute on function public.get_guest_order(uuid, text) to anon, authenticated;
revoke all on function public.set_guest_order_delivery_coordinates(uuid, text, double precision, double precision) from public;
grant execute on function public.set_guest_order_delivery_coordinates(uuid, text, double precision, double precision) to anon, authenticated;

comment on column public.orders.customer_id is 'Nullable for guest orders from published Suya Menús or QR tables; Delivery orders always require authenticated customer.';
comment on column private.order_secrets.guest_access_token_hash is 'One-way token hash for anonymous menu/table order tracking.';
comment on function public.get_guest_order(uuid, text) is 'Token-gated status and item read for anonymous Suya Menús or table QR orders.';
