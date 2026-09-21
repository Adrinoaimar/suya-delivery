-- Idempotencia y recuperación guest para todos los checkouts actuales.
-- El token se genera en el cliente antes del RPC, pero solo su hash se conserva.
-- La huella se calcula con datos normalizados y precios/identidades del servidor;
-- una notificación o el request_id nunca se convierte en autoridad de pago.

alter table public.orders
  add column if not exists idempotency_fingerprint text;

create index if not exists orders_idempotency_lookup_idx
  on public.orders (restaurant_id, origin, idempotency_key);

create function private.create_order_internal_v2(
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
  p_table_session_id uuid default null,
  p_payment_method text default 'cash',
  p_offer_code text default null,
  p_delivery_latitude double precision default null,
  p_delivery_longitude double precision default null,
  p_guest_access_token text default null
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
  canonical_extra_ids jsonb;
  canonical_lines jsonb := '[]'::jsonb;
  canonical_request_lines jsonb := '[]'::jsonb;
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
  created_guest_access_token text;
  guest_access_token_hash text;
  existing_order_id uuid;
  existing_fingerprint text;
  idempotency_fingerprint text;
  normalized_method text := lower(trim(coalesce(p_payment_method, 'cash')));
  normalized_offer text := nullif(upper(btrim(coalesce(p_offer_code, ''))), '');
  all_products_active boolean := true;
begin
  if p_origin not in ('delivery', 'menu', 'table_qr') then
    raise exception 'invalid order origin';
  end if;
  if actor_id is null and not p_allow_guest then
    raise exception 'authentication required';
  end if;
  if p_origin = 'delivery' and actor_id is null then
    raise exception 'authentication required';
  end if;
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if normalized_method not in ('cash', 'yape', 'lemon', 'card') then
    raise exception 'invalid payment method';
  end if;
  if p_guest_access_token is not null
     and p_guest_access_token !~ '^[a-zA-Z0-9_-]{32,128}$' then
    raise exception 'invalid guest access token';
  end if;
  if actor_id is not null then p_guest_access_token := null; end if;
  if (p_delivery_latitude is null) is distinct from (p_delivery_longitude is null) then
    raise exception 'delivery coordinates must be provided together';
  end if;
  if p_delivery_latitude is not null
     and (p_delivery_latitude not between -90 and 90
       or p_delivery_longitude not between -180 and 180) then
    raise exception 'invalid delivery coordinates';
  end if;
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

  select * into restaurant_row
  from public.restaurants r
  where r.id = p_restaurant_id
  for share;
  if not found then raise exception 'restaurant is unavailable'; end if;

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

    -- Se permite leer un producto inactivo para reintentar una orden ya creada;
    -- la regla de activo se aplica solo cuando realmente se va a insertar una nueva.
    select * into product_row
    from public.products p
    where p.id = product_row.id and p.restaurant_id = p_restaurant_id
    for share;
    if not found then raise exception 'product is unavailable'; end if;
    if not product_row.active then all_products_active := false; end if;

    extra_ids := coalesce(item -> 'extra_ids', '[]'::jsonb);
    if jsonb_typeof(extra_ids) <> 'array' then raise exception 'extra_ids must be an array'; end if;
    select count(*), count(distinct value)
      into selected_count, distinct_count
    from jsonb_array_elements_text(extra_ids);
    if selected_count <> distinct_count then raise exception 'duplicate extra'; end if;

    select coalesce(jsonb_agg(
        jsonb_build_object('id', source.value ->> 'id', 'label', source.value ->> 'label',
          'price', (source.value ->> 'price')::numeric)
        order by source.ordinality
      ), '[]'::jsonb),
      coalesce(sum((source.value ->> 'price')::numeric), 0), count(*)
    into canonical_extras, extras_total, matched_count
    from jsonb_array_elements(product_row.extras) with ordinality as source(value, ordinality)
    where source.value ->> 'id' in (select value from jsonb_array_elements_text(extra_ids));

    if matched_count <> selected_count then raise exception 'unknown extra'; end if;
    if extras_total < 0 then raise exception 'invalid extra price'; end if;
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
      into canonical_extra_ids
    from jsonb_array_elements_text(extra_ids);
    canonical_request_lines := canonical_request_lines || jsonb_build_array(jsonb_build_object(
      'product_id', product_row.id,
      'quantity', quantity,
      'extra_ids', canonical_extra_ids,
      'note', note
    ));
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

  idempotency_fingerprint := encode(extensions.digest(
    jsonb_build_object(
      'restaurant_id', p_restaurant_id,
      'actor_id', actor_id,
      'origin', p_origin,
      'table_id', p_table_id,
      'table_session_id', p_table_session_id,
      'payment_method', normalized_method,
      'offer_code', normalized_offer,
      'customer_name', p_customer_name,
      'customer_phone', p_customer_phone,
      'delivery_address', p_delivery_address,
      'delivery_reference', p_delivery_reference,
      'delivery_latitude', p_delivery_latitude,
      'delivery_longitude', p_delivery_longitude,
      'items', canonical_request_lines
    )::text, 'sha256'), 'hex');

  select o.id, o.idempotency_fingerprint
    into existing_order_id, existing_fingerprint
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.idempotency_key = p_request_id
    and (
      (actor_id is not null and o.customer_id = actor_id)
      or (actor_id is null and o.customer_id is null and o.origin = p_origin)
    )
  for share;
  if found then
    if existing_fingerprint is not null and existing_fingerprint <> idempotency_fingerprint then
      raise exception 'idempotency key payload conflict';
    end if;
    if actor_id is null then
      if p_guest_access_token is null or not exists (
        select 1 from private.order_secrets s
        where s.order_id = existing_order_id
          and s.guest_access_token_hash is not null
          and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
      ) then
        raise exception 'guest access token required to recover order';
      end if;
    end if;
    return query
      select existing_order_id, s.delivery_code, s.cancel_code,
        case when actor_id is null then p_guest_access_token else null::text end
      from private.order_secrets s where s.order_id = existing_order_id;
    return;
  end if;

  if not restaurant_row.active then raise exception 'restaurant is unavailable'; end if;
  if not restaurant_row.accepting_orders then raise exception 'restaurant is not accepting orders'; end if;
  if not all_products_active then raise exception 'product is unavailable'; end if;
  if calculated_subtotal < restaurant_row.minimum_order then
    raise exception 'minimum order not reached';
  end if;

  created_delivery_code := private.four_digit_code();
  loop
    created_cancel_code := private.four_digit_code();
    exit when created_cancel_code <> created_delivery_code;
  end loop;

  if actor_id is null then
    created_guest_access_token := coalesce(
      p_guest_access_token,
      encode(extensions.gen_random_bytes(32), 'hex')
    );
    guest_access_token_hash := extensions.crypt(created_guest_access_token, extensions.gen_salt('bf'));
  end if;

  insert into public.orders (
    code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee, discount,
    customer_name, customer_phone, delivery_address, delivery_reference, estimated_minutes,
    idempotency_key, idempotency_fingerprint, origin, table_id, table_session_id,
    delivery_latitude, delivery_longitude
  ) values (
    upper(encode(extensions.gen_random_bytes(5), 'hex')), actor_id, p_restaurant_id, 'confirmed',
    normalized_method::public.payment_method, calculated_subtotal,
    case when p_origin = 'table_qr' then 0 else restaurant_row.delivery_fee end,
    0, p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    restaurant_row.eta_max_minutes, p_request_id, idempotency_fingerprint, p_origin,
    p_table_id, p_table_session_id, p_delivery_latitude, p_delivery_longitude
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
    select o.id, o.idempotency_fingerprint
      into existing_order_id, existing_fingerprint
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and o.idempotency_key = p_request_id
      and (
        (actor_id is not null and o.customer_id = actor_id)
        or (actor_id is null and o.customer_id is null and o.origin = p_origin)
      );
    if existing_order_id is null then raise; end if;
    if existing_fingerprint is not null and existing_fingerprint <> idempotency_fingerprint then
      raise exception 'idempotency key payload conflict';
    end if;
    if actor_id is null then
      if p_guest_access_token is null or not exists (
        select 1 from private.order_secrets s
        where s.order_id = existing_order_id
          and s.guest_access_token_hash is not null
          and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
      ) then
        raise exception 'guest access token required to recover order';
      end if;
    end if;
    return query
      select existing_order_id, s.delivery_code, s.cancel_code,
        case when actor_id is null then p_guest_access_token else null::text end
      from private.order_secrets s where s.order_id = existing_order_id;
end;
$$;

revoke all on function private.create_order_internal_v2(
  uuid, jsonb, text, text, text, text, uuid, boolean, text, uuid, uuid,
  text, text, double precision, double precision, text
) from public, anon, authenticated;

-- Remove only the previous public signatures. Calls with omitted trailing optional
-- arguments remain compatible with the new account-safe definitions below.
drop function if exists public.create_cash_order(uuid, jsonb, text, text, text, uuid);
drop function if exists public.create_cash_order(uuid, jsonb, text, text, text, uuid, text);
drop function if exists public.create_menu_order(uuid, jsonb, text, text, text, uuid);
drop function if exists public.create_menu_order_with_customer(uuid, jsonb, text, text, text, text, uuid);
drop function if exists public.create_menu_order_with_customer(uuid, jsonb, text, text, text, text, uuid, text);
drop function if exists public.create_table_cash_order(uuid, jsonb, text, text, text, uuid, uuid, uuid);
drop function if exists public.create_table_cash_order_with_customer(uuid, jsonb, text, text, text, text, uuid, uuid, uuid);
drop function if exists public.create_table_cash_order_with_customer(uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text);
drop function if exists public.create_menu_order_with_payment(uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision);
drop function if exists public.create_table_order_with_payment(uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text);

create function public.create_cash_order(
  p_restaurant_id uuid, p_items jsonb, p_customer_phone text, p_delivery_address text,
  p_delivery_reference text, p_request_id uuid, p_offer_code text default null,
  p_delivery_latitude double precision default null, p_delivery_longitude double precision default null
)
returns table (order_id uuid, delivery_code text, cancel_code text)
language plpgsql security definer set search_path = '' as $$
declare result record;
begin
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_request_id, false, 'delivery', null, null, 'cash', p_offer_code,
    p_delivery_latitude, p_delivery_longitude, null
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  return query select result.order_id, result.delivery_code, result.cancel_code;
end;
$$;

create function public.create_menu_order(
  p_restaurant_id uuid, p_items jsonb, p_customer_phone text, p_delivery_address text,
  p_delivery_reference text, p_request_id uuid, p_guest_access_token text default null,
  p_delivery_latitude double precision default null, p_delivery_longitude double precision default null
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
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_request_id, true, 'menu', null, null, 'cash', null,
    p_delivery_latitude, p_delivery_longitude, p_guest_access_token
  );
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create function public.create_menu_order_with_customer(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid,
  p_offer_code text default null, p_guest_access_token text default null,
  p_delivery_latitude double precision default null, p_delivery_longitude double precision default null
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
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'menu', null, null, 'cash', p_offer_code,
    p_delivery_latitude, p_delivery_longitude, p_guest_access_token
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create function public.create_table_cash_order(
  p_restaurant_id uuid, p_items jsonb, p_customer_phone text, p_delivery_address text,
  p_delivery_reference text, p_request_id uuid, p_table_id uuid,
  p_table_session_id uuid default null, p_guest_access_token text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare v_session uuid; result record;
begin
  if p_table_id is null then raise exception 'table is required'; end if;
  select s.id into v_session from public.table_sessions s
  join public.restaurant_tables t on t.id = s.table_id
  where s.table_id = p_table_id and s.restaurant_id = p_restaurant_id and t.active
    and s.status in ('open', 'payment_pending')
    and (p_table_session_id is null or s.id = p_table_session_id)
  order by s.opened_at desc limit 1;
  if v_session is null then raise exception 'active table session is required'; end if;
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_request_id, true, 'table_qr', p_table_id, v_session, 'cash', null, null, null,
    p_guest_access_token
  );
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create function public.create_table_cash_order_with_customer(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid, p_table_id uuid,
  p_table_session_id uuid default null, p_offer_code text default null,
  p_guest_access_token text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare v_session uuid; result record;
begin
  if p_table_id is null then raise exception 'table is required'; end if;
  select s.id into v_session from public.table_sessions s
  join public.restaurant_tables t on t.id = s.table_id
  where s.table_id = p_table_id and s.restaurant_id = p_restaurant_id and t.active
    and s.status in ('open', 'payment_pending')
    and (p_table_session_id is null or s.id = p_table_session_id)
  order by s.opened_at desc limit 1;
  if v_session is null then raise exception 'active table session is required'; end if;
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'table_qr', p_table_id, v_session, 'cash',
    p_offer_code, null, null, p_guest_access_token
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create or replace function public.create_delivery_order_with_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_phone text, p_delivery_address text,
  p_delivery_reference text, p_request_id uuid, p_method text, p_offer_code text default null,
  p_delivery_latitude double precision default null, p_delivery_longitude double precision default null
)
returns table (order_id uuid, delivery_code text, cancel_code text)
language plpgsql security definer set search_path = '' as $$
declare result record; intent record;
begin
  perform private.require_wallet_account(p_restaurant_id, p_method);
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, null, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_request_id, false, 'delivery', null, null, p_method, p_offer_code,
    p_delivery_latitude, p_delivery_longitude, null
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select * into intent from public.create_payment_intent(result.order_id, p_method, null);
  return query select result.order_id, result.delivery_code, result.cancel_code;
end;
$$;

create function public.create_menu_order_with_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid, p_method text,
  p_offer_code text default null, p_delivery_latitude double precision default null,
  p_delivery_longitude double precision default null, p_guest_access_token text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare result record; intent record;
begin
  if not exists (
    select 1 from public.restaurant_menu_settings m
    join public.restaurants r on r.id = m.restaurant_id
    where m.restaurant_id = p_restaurant_id and m.published and r.active
  ) then raise exception 'menu is unavailable'; end if;
  perform private.require_wallet_account(p_restaurant_id, p_method);
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'menu', null, null, p_method, p_offer_code,
    p_delivery_latitude, p_delivery_longitude, p_guest_access_token
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select * into intent from public.create_payment_intent(result.order_id, p_method, result.guest_access_token);
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

create function public.create_table_order_with_payment(
  p_restaurant_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text,
  p_delivery_address text, p_delivery_reference text, p_request_id uuid, p_table_id uuid,
  p_table_session_id uuid, p_method text, p_offer_code text default null,
  p_guest_access_token text default null
)
returns table (order_id uuid, delivery_code text, cancel_code text, guest_access_token text)
language plpgsql security definer set search_path = '' as $$
declare v_session uuid; result record; intent record;
begin
  if p_table_id is null then raise exception 'table is required'; end if;
  select s.id into v_session from public.table_sessions s
  join public.restaurant_tables t on t.id = s.table_id
  where s.table_id = p_table_id and s.restaurant_id = p_restaurant_id and t.active
    and s.status in ('open', 'payment_pending')
    and (p_table_session_id is null or s.id = p_table_session_id)
  order by s.opened_at desc limit 1;
  if v_session is null then raise exception 'active table session is required'; end if;
  perform private.require_wallet_account(p_restaurant_id, p_method);
  select * into result from private.create_order_internal_v2(
    p_restaurant_id, p_items, p_customer_name, p_customer_phone, p_delivery_address,
    p_delivery_reference, p_request_id, true, 'table_qr', p_table_id, v_session, p_method,
    p_offer_code, null, null, p_guest_access_token
  );
  perform private.apply_app_offer(result.order_id, p_offer_code);
  select * into intent from public.create_payment_intent(result.order_id, p_method, result.guest_access_token);
  return query select result.order_id, result.delivery_code, result.cancel_code, result.guest_access_token;
end;
$$;

revoke all on function public.create_cash_order(
  uuid, jsonb, text, text, text, uuid, text, double precision, double precision
) from public, anon;
grant execute on function public.create_cash_order(
  uuid, jsonb, text, text, text, uuid, text, double precision, double precision
) to authenticated;
revoke all on function public.create_menu_order(
  uuid, jsonb, text, text, text, uuid, text, double precision, double precision
) from public;
grant execute on function public.create_menu_order(
  uuid, jsonb, text, text, text, uuid, text, double precision, double precision
) to anon, authenticated;
revoke all on function public.create_menu_order_with_customer(
  uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision
) from public;
grant execute on function public.create_menu_order_with_customer(
  uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision
) to anon, authenticated;
revoke all on function public.create_table_cash_order(
  uuid, jsonb, text, text, text, uuid, uuid, uuid, text
) from public;
grant execute on function public.create_table_cash_order(
  uuid, jsonb, text, text, text, uuid, uuid, uuid, text
) to anon, authenticated;
revoke all on function public.create_table_cash_order_with_customer(
  uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text
) from public;
grant execute on function public.create_table_cash_order_with_customer(
  uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text
) to anon, authenticated;
revoke all on function public.create_delivery_order_with_payment(
  uuid, jsonb, text, text, text, uuid, text, text, double precision, double precision
) from public, anon;
grant execute on function public.create_delivery_order_with_payment(
  uuid, jsonb, text, text, text, uuid, text, text, double precision, double precision
) to authenticated;
revoke all on function public.create_menu_order_with_payment(
  uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision, text
) from public;
grant execute on function public.create_menu_order_with_payment(
  uuid, jsonb, text, text, text, text, uuid, text, text, double precision, double precision, text
) to anon, authenticated;
revoke all on function public.create_table_order_with_payment(
  uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text, text
) from public;
grant execute on function public.create_table_order_with_payment(
  uuid, jsonb, text, text, text, text, uuid, uuid, uuid, text, text, text
) to anon, authenticated;

comment on column public.orders.idempotency_fingerprint is
  'Huella canónica server-side para detectar reutilización de request_id con otro payload; no contiene el token guest.';
comment on function private.create_order_internal_v2(uuid, jsonb, text, text, text, text, uuid, boolean, text, uuid, uuid, text, text, double precision, double precision, text)
  is 'Creates a validated order once, recovers guest retries with a caller-held token, and rejects payload conflicts.';
