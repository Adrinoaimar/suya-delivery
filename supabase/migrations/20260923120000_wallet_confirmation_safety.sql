-- Impide autorizar un wallet sin la observación exacta. Tras una espera concurrente,
-- SELECT FOR UPDATE puede no devolver fila si otro pedido consumió el evento.
do $$
begin
  if exists (
    select 1 from public.payment_attempts
    where provider = 'wallet_observer'
      and method in ('yape', 'lemon')
      and status = 'authorized'
      and observed_wallet_observation_id is null
  ) then
    raise exception 'Existen pagos wallet autorizados sin observación; requieren revisión manual';
  end if;
end;
$$;

create or replace function private.require_wallet_observation_for_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'authorized' and new.provider = 'wallet_observer'
    and new.method in ('yape', 'lemon')
    and new.observed_wallet_observation_id is null then
    raise exception 'No se pudo validar el pago observado. Inténtalo de nuevo.';
  end if;
  return new;
end;
$$;

revoke all on function private.require_wallet_observation_for_authorization()
  from public, anon, authenticated;

create trigger payment_attempts_require_wallet_observation
before insert or update of status, method, observed_wallet_observation_id
on public.payment_attempts
for each row execute function private.require_wallet_observation_for_authorization();

-- Cuenta códigos en la declaración, incluso llamadas directas a
-- declare_manual_payment. Solo guarda ID y contador, nunca el código.
create table private.yape_confirmation_attempt_limits (
  payment_attempt_id uuid primary key references public.payment_attempts(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

revoke all on private.yape_confirmation_attempt_limits from public, anon, authenticated;

create or replace function private.consume_yape_confirmation_attempt(p_payment_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into private.yape_confirmation_attempt_limits
    (payment_attempt_id, window_started_at, request_count)
  values (p_payment_attempt_id, now(), 1)
  on conflict (payment_attempt_id) do update
  set window_started_at = case
        when private.yape_confirmation_attempt_limits.window_started_at <= now() - interval '10 minutes'
          then now()
        else private.yape_confirmation_attempt_limits.window_started_at
      end,
      request_count = case
        when private.yape_confirmation_attempt_limits.window_started_at <= now() - interval '10 minutes'
          then 1
        else private.yape_confirmation_attempt_limits.request_count + 1
      end,
      updated_at = now()
  returning request_count into v_count;

  -- El incremento rechazado revierte; los cinco intentos previos persisten.
  if v_count > 5 then
    raise exception 'Demasiados códigos Yape. Espera 10 minutos antes de intentar de nuevo.';
  end if;
end;
$$;

revoke all on function private.consume_yape_confirmation_attempt(uuid)
  from public, anon, authenticated;

create or replace function private.limit_yape_payment_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- El polling de confirmación repite el mismo código. Solo una conjetura
  -- distinta consume cupo; el código nunca se guarda en esta tabla privada.
  if tg_op = 'UPDATE' then
    if new.code_last4 is not distinct from old.code_last4 then
      return new;
    end if;
  end if;
  if new.code_last4 is not null and exists (
    select 1 from public.payment_attempts pa
    where pa.id = new.payment_attempt_id
      and pa.provider = 'wallet_observer'
      and pa.method = 'yape'
      and pa.status = 'pending'
  ) then
    perform private.consume_yape_confirmation_attempt(new.payment_attempt_id);
  end if;
  return new;
end;
$$;

revoke all on function private.limit_yape_payment_claims()
  from public, anon, authenticated;

create trigger payment_claims_limit_yape_code_attempts
after insert or update of code_last4
on public.payment_claims
for each row execute function private.limit_yape_payment_claims();
