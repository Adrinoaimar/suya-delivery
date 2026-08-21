alter table public.orders add column idempotency_key uuid;
update public.orders set idempotency_key = gen_random_uuid() where idempotency_key is null;
alter table public.orders alter column idempotency_key set not null;
alter table public.orders add constraint orders_customer_idempotency_unique
  unique (customer_id, idempotency_key);

alter table private.order_secrets
  add column delivery_code text not null check (delivery_code ~ '^[0-9]{4}$'),
  add column cancel_code text not null check (cancel_code ~ '^[0-9]{4}$');

alter table public.order_items
  add column extras_total numeric(10,2) not null default 0 check (extras_total >= 0);
alter table public.order_items drop column line_total;
alter table public.order_items add column line_total numeric(10,2)
  generated always as ((unit_price + extras_total) * quantity) stored;

create function private.four_digit_code()
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  random_bytes bytea;
  value integer;
begin
  random_bytes := extensions.gen_random_bytes(2);
  value := (get_byte(random_bytes, 0) * 256 + get_byte(random_bytes, 1)) % 10000;
  return lpad(value::text, 4, '0');
end;
$$;

create function public.create_cash_order(
  p_restaurant_id uuid,
  p_items jsonb,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_reference text,
  p_request_id uuid
)
returns table (order_id uuid, delivery_code text, cancel_code text)
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
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'items must contain between 1 and 50 lines';
  end if;

  select * into profile_row from public.profiles where id = actor_id;
  if not found then raise exception 'customer profile is required'; end if;

  p_customer_phone := coalesce(nullif(btrim(p_customer_phone), ''), profile_row.phone);
  p_delivery_address := coalesce(nullif(btrim(p_delivery_address), ''), profile_row.default_address);
  p_delivery_reference := coalesce(btrim(p_delivery_reference), '');
  if p_customer_phone is null or p_customer_phone !~ '^\+?[0-9 ()-]{6,20}$' then
    raise exception 'valid customer phone is required';
  end if;
  if p_delivery_address is null or length(p_delivery_address) not between 5 and 300 then
    raise exception 'valid delivery address is required';
  end if;
  if length(p_delivery_reference) > 300 then raise exception 'delivery reference is too long'; end if;

  select o.id into existing_order_id
  from public.orders o
  where o.customer_id = actor_id and o.idempotency_key = p_request_id;
  if found then
    return query
      select existing_order_id, s.delivery_code, s.cancel_code
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

  insert into public.orders (
    code, customer_id, restaurant_id, status, payment_method, subtotal, delivery_fee, discount,
    customer_name, customer_phone, delivery_address, delivery_reference, estimated_minutes,
    idempotency_key
  ) values (
    upper(encode(extensions.gen_random_bytes(5), 'hex')), actor_id, p_restaurant_id, 'confirmed',
    'cash', calculated_subtotal, restaurant_row.delivery_fee, 0, profile_row.display_name,
    p_customer_phone, p_delivery_address, p_delivery_reference, restaurant_row.eta_max_minutes,
    p_request_id
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
    order_id, delivery_code_hash, cancel_code_hash, delivery_code, cancel_code
  ) values (
    created_order_id,
    extensions.crypt(created_delivery_code, extensions.gen_salt('bf')),
    extensions.crypt(created_cancel_code, extensions.gen_salt('bf')),
    created_delivery_code, created_cancel_code
  );

  return query select created_order_id, created_delivery_code, created_cancel_code;
exception
  when unique_violation then
    select o.id into existing_order_id
    from public.orders o
    where o.customer_id = actor_id and o.idempotency_key = p_request_id;
    if existing_order_id is null then raise; end if;
    return query
      select existing_order_id, s.delivery_code, s.cancel_code
      from private.order_secrets s where s.order_id = existing_order_id;
end;
$$;

create function public.get_order_codes(target_order uuid)
returns table (delivery_code text, cancel_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.delivery_code, s.cancel_code
  from private.order_secrets s
  join public.orders o on o.id = s.order_id
  where o.id = target_order and o.customer_id = (select auth.uid());
$$;

create function public.cancel_order_with_code(target_order uuid, supplied_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  secret_row private.order_secrets%rowtype;
begin
  select * into order_row from public.orders
  where id = target_order and customer_id = (select auth.uid()) for update;
  if not found then return false; end if;
  if order_row.status in ('delivered', 'cancelled', 'picked_up', 'on_the_way') then return false; end if;
  select * into secret_row from private.order_secrets where order_id = target_order for update;
  if secret_row.locked_until is not null and secret_row.locked_until > now() then return false; end if;
  if extensions.crypt(btrim(supplied_code), secret_row.cancel_code_hash) <> secret_row.cancel_code_hash then
    update private.order_secrets set
      cancel_failed_attempts = least(cancel_failed_attempts + 1, 10),
      locked_until = case when cancel_failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where order_id = target_order;
    return false;
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now(),
    cancellation_reason = 'cancelled_by_customer' where id = target_order;
  return true;
end;
$$;

create function public.confirm_order_delivery(target_order uuid, supplied_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  secret_row private.order_secrets%rowtype;
begin
  select * into order_row from public.orders
  where id = target_order and rider_id = (select auth.uid()) for update;
  if not found or order_row.status <> 'on_the_way' then return false; end if;
  select * into secret_row from private.order_secrets where order_id = target_order for update;
  if secret_row.locked_until is not null and secret_row.locked_until > now() then return false; end if;
  if extensions.crypt(btrim(supplied_code), secret_row.delivery_code_hash) <> secret_row.delivery_code_hash then
    update private.order_secrets set
      delivery_failed_attempts = least(delivery_failed_attempts + 1, 10),
      locked_until = case when delivery_failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where order_id = target_order;
    return false;
  end if;
  update public.orders set delivery_verified_at = now(), status = 'delivered' where id = target_order;
  return true;
end;
$$;

create or replace function private.validate_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.code, new.customer_id, new.restaurant_id, new.subtotal, new.delivery_fee,
      new.discount, new.payment_method, new.customer_name, new.customer_phone,
      new.delivery_address, new.delivery_reference,
      new.estimated_minutes, new.created_at, new.idempotency_key)
    is distinct from
     (old.id, old.code, old.customer_id, old.restaurant_id, old.subtotal, old.delivery_fee,
      old.discount, old.payment_method, old.customer_name, old.customer_phone,
      old.delivery_address, old.delivery_reference,
      old.estimated_minutes, old.created_at, old.idempotency_key) then
    raise exception 'immutable order fields cannot be changed';
  end if;
  if (new.delivery_latitude, new.delivery_longitude) is distinct from
     (old.delivery_latitude, old.delivery_longitude)
    and current_user not in ('service_role', 'postgres') then
    raise exception 'delivery coordinates are backend-only';
  end if;
  if new.rider_id is distinct from old.rider_id then
    if current_user not in ('service_role', 'postgres') and not private.is_platform_admin()
      and not private.has_restaurant_role(new.restaurant_id, array['owner', 'manager']::public.restaurant_role[]) then
      raise exception 'only authorized dispatch can assign a rider';
    end if;
    if new.rider_id is not null and not exists (
      select 1 from public.rider_profiles rp where rp.user_id = new.rider_id
        and rp.verified_at is not null and rp.status in ('available', 'busy')
    ) then raise exception 'rider is not eligible for assignment'; end if;
  end if;
  if (new.cancelled_at, new.cancellation_reason) is distinct from
     (old.cancelled_at, old.cancellation_reason)
    and current_user not in ('service_role', 'postgres') and not private.is_platform_admin()
    and not private.is_restaurant_member(new.restaurant_id) then
    raise exception 'cancellation metadata is backend or restaurant only';
  end if;
  if new.delivery_verified_at is distinct from old.delivery_verified_at
    and current_user not in ('service_role', 'postgres') and not private.is_platform_admin() then
    raise exception 'delivery verification is backend-only';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'confirmed' and new.status in ('preparing', 'cancelled')) or
    (old.status = 'preparing' and new.status in ('picked_up', 'cancelled')) or
    (old.status = 'picked_up' and new.status = 'on_the_way') or
    (old.status = 'on_the_way' and new.status = 'delivered')
  ) then raise exception 'invalid order status transition'; end if;
  if new.status = 'delivered' and new.delivery_verified_at is null then
    raise exception 'delivery code must be verified before delivery';
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then
    raise exception 'cancelled_at is required';
  end if;
  return new;
end;
$$;

revoke all on function private.four_digit_code() from public, anon, authenticated;
revoke all on function public.create_cash_order(uuid, jsonb, text, text, text, uuid) from public;
revoke all on function public.get_order_codes(uuid) from public;
revoke all on function public.cancel_order_with_code(uuid, text) from public;
revoke all on function public.confirm_order_delivery(uuid, text) from public;
grant execute on function public.create_cash_order(uuid, jsonb, text, text, text, uuid) to authenticated;
grant execute on function public.get_order_codes(uuid) to authenticated;
grant execute on function public.cancel_order_with_code(uuid, text) to authenticated;
grant execute on function public.confirm_order_delivery(uuid, text) to authenticated;
