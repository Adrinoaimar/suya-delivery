-- Conciliación AutoCloud de QR estático SIN céntimos únicos.
-- El importe a pagar vuelve a ser el total exacto del pedido. Cuando dos pedidos pendientes comparten
-- importe, el aviso bancario solo se asocia si el nombre del pagador identifica a uno solo; si no,
-- queda como "unreconciled" para revisión y NO se aprueba ningún pedido.

drop index if exists public.payment_attempts_static_autocloud_unique_amount_uidx;
drop index if exists public.payment_attempts_static_autocloud_network_unique_uidx;

drop function if exists private.allocate_static_qr_conciliation_cents(uuid, bigint, text);

create or replace function private.allocate_static_qr_conciliation_cents(
  p_gateway_config_id uuid,
  p_base_amount_cents bigint,
  p_wallet_network text default 'yape'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_base_amount_cents is null or p_base_amount_cents <= 0 then
    raise exception 'positive amount is required';
  end if;
  return p_base_amount_cents;
end;
$$;

revoke all on function private.allocate_static_qr_conciliation_cents(uuid, bigint, text)
  from public, anon, authenticated;

create or replace function private.normalize_person_name(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    translate(lower(coalesce(p_value, '')), 'áéíóúüàèìòù', 'aeiouuaeiou'),
    '[^a-zñ0-9]+', ' ', 'g'
  ));
$$;

revoke all on function private.normalize_person_name(text) from public, anon, authenticated;

drop function if exists public.find_pending_static_qr_attempt_for_autocloud(uuid[], text, bigint, text);

create or replace function public.find_pending_static_qr_attempt_for_autocloud(
  p_restaurant_ids uuid[] default null,
  p_checkout_reference text default null,
  p_amount_cents bigint default null,
  p_wallet_network text default null,
  p_payer_name text default null
)
returns table (
  payment_attempt_id uuid,
  order_id uuid,
  expected_amount_cents bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := nullif(upper(trim(coalesce(p_checkout_reference, ''))), '');
  v_network text := nullif(lower(trim(coalesce(p_wallet_network, ''))), '');
  v_payer text := nullif(private.normalize_person_name(p_payer_name), '');
  v_ids uuid[];
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'only backend service_role can query autocloud candidates';
  end if;

  -- Referencia explícita del pedido: debe ser única.
  if v_ref is not null then
    select array_agg(pa.id) into v_ids
    from public.payment_attempts pa
    join public.orders o on o.id = pa.order_id
    join public.payment_gateway_configs c on c.id = pa.gateway_config_id
    where pa.provider = 'static_qr'
      and pa.verification_mode = 'automatic_cloud'
      and c.provider = 'static_qr'
      and c.active = true
      and pa.checkout_reference = v_ref
      and (p_restaurant_ids is null or o.restaurant_id = any(p_restaurant_ids))
      and (v_network is null or pa.static_wallet_network is null or pa.static_wallet_network = v_network);

    if coalesce(array_length(v_ids, 1), 0) = 1 then
      return query
      select pa.id, pa.order_id, pa.amount_cents
      from public.payment_attempts pa
      where pa.id = v_ids[1];
    end if;
    return;
  end if;

  if p_amount_cents is null then
    return;
  end if;

  -- Importe exacto del pedido entre intentos pendientes del mismo receptor y red.
  select array_agg(pa.id) into v_ids
  from public.payment_attempts pa
  join public.orders o on o.id = pa.order_id
  join public.payment_gateway_configs c on c.id = pa.gateway_config_id
  where pa.provider = 'static_qr'
    and pa.verification_mode = 'automatic_cloud'
    and pa.status = 'pending'
    and pa.expires_at > now()
    and o.status <> 'cancelled'
    and c.provider = 'static_qr'
    and c.active = true
    and (p_restaurant_ids is null or o.restaurant_id = any(p_restaurant_ids))
    and (v_network is null or pa.static_wallet_network is null or pa.static_wallet_network = v_network)
    and pa.amount_cents = p_amount_cents;

  if coalesce(array_length(v_ids, 1), 0) = 1 then
    return query
    select pa.id, pa.order_id, pa.amount_cents
    from public.payment_attempts pa
    where pa.id = v_ids[1];
    return;
  end if;

  -- Varios pedidos con el mismo importe: solo se desambigua por nombre del pagador.
  if coalesce(array_length(v_ids, 1), 0) > 1 and v_payer is not null then
    select array_agg(pa.id) into v_ids
    from public.payment_attempts pa
    join public.orders o on o.id = pa.order_id
    where pa.id = any(v_ids)
      and private.normalize_person_name(o.customer_name) <> ''
      and (
        private.normalize_person_name(o.customer_name) = v_payer
        or v_payer like private.normalize_person_name(o.customer_name) || ' %'
        or private.normalize_person_name(o.customer_name) like v_payer || ' %'
      );

    if coalesce(array_length(v_ids, 1), 0) = 1 then
      return query
      select pa.id, pa.order_id, pa.amount_cents
      from public.payment_attempts pa
      where pa.id = v_ids[1];
    end if;
  end if;
end;
$$;

revoke all on function public.find_pending_static_qr_attempt_for_autocloud(uuid[], text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.find_pending_static_qr_attempt_for_autocloud(uuid[], text, bigint, text, text)
  to service_role;
