-- Una misma evidencia observada por dos dispositivos no puede autorizar dos
-- intentos. La notificación sigue siendo evidencia no confiable: si el código
-- coincide con un abono ya confirmado, el segundo caso queda para revisión.
-- El advisory lock transaccional también serializa dos operadores concurrentes
-- que intenten consumir la misma identidad al mismo tiempo.

create or replace function private.prevent_wallet_evidence_reuse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_observation public.wallet_observations%rowtype;
begin
  if new.status <> 'authorized' or new.observed_wallet_observation_id is null then
    return new;
  end if;

  select * into current_observation
  from public.wallet_observations
  where id = new.observed_wallet_observation_id;
  if not found or current_observation.code_last4 is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws('|',
      current_observation.restaurant_id::text,
      coalesce(current_observation.receiver_account_id::text, ''),
      current_observation.provider,
      current_observation.currency,
      current_observation.amount_cents::text,
      current_observation.code_last4
    ),
    0
  ));

  if exists (
    select 1
    from public.payment_attempts previous_attempt
    join public.wallet_observations previous_observation
      on previous_observation.id = previous_attempt.observed_wallet_observation_id
    where previous_attempt.id <> new.id
      and previous_attempt.status = 'authorized'
      and previous_observation.verification_status = 'verified'
      and previous_observation.restaurant_id = current_observation.restaurant_id
      and previous_observation.receiver_account_id is not distinct from current_observation.receiver_account_id
      and previous_observation.provider = current_observation.provider
      and previous_observation.currency = current_observation.currency
      and previous_observation.amount_cents = current_observation.amount_cents
      and previous_observation.code_last4 = current_observation.code_last4
      and previous_observation.observed_at between current_observation.observed_at - interval '7 days'
        and current_observation.observed_at + interval '7 days'
  ) then
    raise exception 'wallet evidence already consumed; review duplicate';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_attempts_wallet_evidence_reuse_guard on public.payment_attempts;
create trigger payment_attempts_wallet_evidence_reuse_guard
  before update of status, observed_wallet_observation_id on public.payment_attempts
  for each row execute function private.prevent_wallet_evidence_reuse();

revoke all on function private.prevent_wallet_evidence_reuse() from public, anon, authenticated;

comment on function private.prevent_wallet_evidence_reuse() is
  'Serializa y rechaza reutilizar una evidencia wallet ya consumida; los casos parecidos pasan a revisión manual.';
