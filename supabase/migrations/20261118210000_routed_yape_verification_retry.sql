-- Límite por pedido, incluido el primer código guardado por versiones anteriores.
create table private.routed_yape_code_budget (
  order_id uuid primary key references public.orders(id) on delete cascade,
  submissions smallint not null check (submissions between 1 and 3)
);
alter table private.routed_yape_code_budget enable row level security;
revoke all on private.routed_yape_code_budget from public, anon, authenticated;

create or replace function private.guard_routed_yape_code_retry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_submissions smallint;
begin
  if old.observer_route_id is null or old.method <> 'yape'
    or old.payer_code_hmac is not distinct from new.payer_code_hmac then
    return new;
  end if;
  if old.status <> 'pending' or old.expires_at <= now() or new.payer_code_hmac is null then
    raise exception 'SUYA_YAPE_CLOSED';
  end if;
  insert into private.routed_yape_code_budget (order_id, submissions)
  values (old.order_id, case when old.payer_code_hmac is null then 1 else 2 end)
  on conflict (order_id) do update
    set submissions = private.routed_yape_code_budget.submissions + 1
    where private.routed_yape_code_budget.submissions < 3
  returning submissions into v_submissions;
  if v_submissions is null then raise exception 'SUYA_YAPE_RETRY_LIMIT'; end if;
  return new;
end;
$$;

create function public.verify_routed_yape_code(
  p_order_id uuid, p_code text, p_payer_display_name text default null,
  p_guest_access_token text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_code_hmac text;
  v_candidate_count bigint;
  v_matching_count bigint;
begin
  perform private.require_payment_actor(p_order_id, p_guest_access_token);
  if p_code is null or p_code !~ '^[0-9]{3}$' then raise exception 'invalid Yape code'; end if;
  perform 1 from public.orders where id = p_order_id for update;

  select * into v_attempt from public.payment_attempts
  where order_id = p_order_id and observer_route_id is not null and method = 'yape'
  order by created_at desc limit 1 for update;
  if not found then raise exception 'routed Yape attempt not found'; end if;
  if v_attempt.status = 'authorized' then return 'authorized'; end if;
  if v_attempt.status <> 'pending' or v_attempt.expires_at <= now() then return 'expired'; end if;

  begin
    perform public.declare_manual_payment(p_order_id, p_code, p_payer_display_name, p_guest_access_token);
  exception when raise_exception then
    if sqlerrm = 'SUYA_YAPE_RETRY_LIMIT' then return 'retry_limit'; end if;
    if sqlerrm = 'SUYA_YAPE_CLOSED' then return 'expired'; end if;
    raise;
  end;

  if exists (select 1 from public.payment_attempts where id = v_attempt.id and status = 'authorized') then
    return 'authorized';
  end if;

  v_code_hmac := private.payment_claim_hmac(p_code);
  select count(*), count(*) filter (where o.code_hmac = v_code_hmac)
    into v_candidate_count, v_matching_count
  from public.wallet_observations o
  join public.wallet_observer_devices d on d.id = o.device_id and d.active and d.auto_settle_orders
  where o.observer_route_id = v_attempt.observer_route_id
    and o.observer_route_version = v_attempt.observer_route_version
    and o.provider = 'yape' and o.currency = 'PEN'
    and o.amount_cents = v_attempt.amount_cents
    and o.code_hmac is not null and o.code_last4 ~ '^[0-9]{3}$'
    and o.verification_status in ('unverified','under_review')
    and o.observed_at between greatest(v_attempt.created_at, now() - interval '15 minutes')
      and least(v_attempt.expires_at, clock_timestamp());

  if v_matching_count > 0 then return 'review'; end if;
  if v_candidate_count = 1 and not exists (
    select 1 from public.payment_attempts other
    where other.id <> v_attempt.id and other.observer_route_id = v_attempt.observer_route_id
      and other.observer_route_version = v_attempt.observer_route_version
      and other.method = 'yape' and other.amount_cents = v_attempt.amount_cents
      and other.status = 'pending' and other.expires_at > v_attempt.created_at
      and other.created_at <= v_attempt.expires_at
  ) then return 'code_mismatch'; end if;
  if v_candidate_count > 0 then return 'review'; end if;
  return 'unobserved';
end;
$$;

revoke all on function public.verify_routed_yape_code(uuid,text,text,text) from public;
grant execute on function public.verify_routed_yape_code(uuid,text,text,text) to anon, authenticated;
