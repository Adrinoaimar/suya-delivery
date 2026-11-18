-- Un reclamo conserva evidencia para Caja sin cambiar el pedido ni el intento de pago.
create table private.expired_wallet_qr_claims (
  payment_attempt_id uuid primary key references public.payment_attempts(id) on delete cascade,
  payer_name text not null check (char_length(payer_name) between 2 and 120),
  receipt_reference text check (receipt_reference ~ '^[a-zA-Z0-9-]{3,48}$'),
  reported_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table private.expired_wallet_qr_claims enable row level security;
revoke all on private.expired_wallet_qr_claims from public, anon, authenticated;

create function public.report_expired_wallet_qr(
  p_order_id uuid, p_payment_attempt_id uuid, p_payer_name text,
  p_receipt_reference text default null, p_guest_access_token text default null
)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_reported_at timestamptz;
  v_name text := btrim(regexp_replace(coalesce(p_payer_name, ''), '[[:space:]]+', ' ', 'g'));
  v_reference text := nullif(btrim(coalesce(p_receipt_reference, '')), '');
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  if char_length(v_name) not between 2 and 120 or v_name ~ '[[:cntrl:]]'
    or (v_reference is not null and v_reference !~ '^[a-zA-Z0-9-]{3,48}$') then
    raise exception 'Datos del reclamo inválidos.';
  end if;

  perform 1 from public.orders o where o.id = p_order_id for update;
  perform 1 from public.payment_attempts pa
  where pa.id = p_payment_attempt_id and pa.order_id = p_order_id and pa.method in ('yape', 'lemon')
    and (pa.observer_route_id is not null or pa.provider in ('wallet_observer', 'static_qr'))
    and pa.status in ('pending', 'failed') and pa.expires_at <= now()
  for share;
  if not found then raise exception 'El intento no admite un reclamo por vencimiento.'; end if;

  insert into private.expired_wallet_qr_claims (payment_attempt_id, payer_name, receipt_reference)
  values (p_payment_attempt_id, v_name, v_reference)
  on conflict (payment_attempt_id) do nothing;

  select c.reported_at into strict v_reported_at from private.expired_wallet_qr_claims c
  where c.payment_attempt_id = p_payment_attempt_id;
  return v_reported_at;
end;
$$;

create function public.get_expired_wallet_qr_claim(
  p_order_id uuid, p_payment_attempt_id uuid, p_guest_access_token text default null
)
returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  v_reported_at timestamptz;
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  select c.reported_at into v_reported_at
  from private.expired_wallet_qr_claims c
  join public.payment_attempts pa on pa.id = c.payment_attempt_id
  where pa.order_id = p_order_id and pa.id = p_payment_attempt_id;
  return v_reported_at;
end;
$$;

create function public.list_expired_wallet_qr_claims(p_restaurant_id uuid)
returns table (
  attempt_id uuid, order_code text, method text, amount numeric,
  payer_name text, receipt_reference text, reported_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  return query
    select pa.id, o.code, pa.method::text, pa.amount, c.payer_name, c.receipt_reference, c.reported_at
    from private.expired_wallet_qr_claims c
    join public.payment_attempts pa on pa.id = c.payment_attempt_id
    join public.orders o on o.id = pa.order_id
    where o.restaurant_id = p_restaurant_id and c.reviewed_at is null
    order by c.reported_at, pa.id
    limit 100;
end;
$$;

create function public.review_expired_wallet_qr_claim(p_restaurant_id uuid, p_payment_attempt_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_wallet_route_admin(p_restaurant_id);
  update private.expired_wallet_qr_claims c
  set reviewed_at = coalesce(c.reviewed_at, now()),
      reviewed_by = coalesce(c.reviewed_by, (select auth.uid()))
  from public.payment_attempts pa join public.orders o on o.id = pa.order_id
  where c.payment_attempt_id = p_payment_attempt_id and pa.id = c.payment_attempt_id
    and o.restaurant_id = p_restaurant_id;
  return found;
end;
$$;

revoke all on function public.report_expired_wallet_qr(uuid, uuid, text, text, text),
  public.get_expired_wallet_qr_claim(uuid, uuid, text),
  public.list_expired_wallet_qr_claims(uuid),
  public.review_expired_wallet_qr_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.report_expired_wallet_qr(uuid, uuid, text, text, text),
  public.get_expired_wallet_qr_claim(uuid, uuid, text) to anon, authenticated;
grant execute on function public.list_expired_wallet_qr_claims(uuid),
  public.review_expired_wallet_qr_claim(uuid, uuid) to authenticated;
