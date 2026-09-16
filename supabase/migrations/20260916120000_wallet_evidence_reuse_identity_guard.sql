-- P-02: reuse protection must compare the strongest available identity.
-- Last-four digits are only a fallback when no full fingerprint/HMAC exists;
-- different payments sharing a suffix must remain independently reviewable.

create or replace function private.prevent_wallet_evidence_reuse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_observation public.wallet_observations%rowtype;
  evidence_key text;
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

  evidence_key := coalesce(
    current_observation.code_hmac,
    current_observation.code_hmac_context,
    current_observation.code_fingerprint,
    current_observation.code_last4
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws('|',
      current_observation.restaurant_id::text,
      coalesce(current_observation.receiver_account_id::text, ''),
      current_observation.provider,
      current_observation.currency,
      current_observation.amount_cents::text,
      evidence_key
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
      and previous_observation.observed_at between current_observation.observed_at - interval '7 days'
        and current_observation.observed_at + interval '7 days'
      and (
        (
          previous_observation.code_hmac_context is not null
          and current_observation.code_hmac_context is not null
          and previous_observation.code_hmac_context = current_observation.code_hmac_context
        )
        or (
          (previous_observation.code_hmac_context is null or current_observation.code_hmac_context is null)
          and previous_observation.code_hmac is not null
          and current_observation.code_hmac is not null
          and previous_observation.code_hmac = current_observation.code_hmac
        )
        or (
          (previous_observation.code_hmac_context is null or current_observation.code_hmac_context is null)
          and (previous_observation.code_hmac is null or current_observation.code_hmac is null)
          and (
            (
              previous_observation.code_fingerprint is not null
              and current_observation.code_fingerprint is not null
              and previous_observation.code_fingerprint = current_observation.code_fingerprint
            )
            or (
              (previous_observation.code_fingerprint is null or current_observation.code_fingerprint is null)
              and previous_observation.code_last4 = current_observation.code_last4
            )
          )
        )
      )
  ) then
    raise exception 'wallet evidence already consumed; review duplicate';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_wallet_evidence_reuse() from public, anon, authenticated;

comment on function private.prevent_wallet_evidence_reuse() is
  'Serializa y rechaza reutilizar una evidencia wallet por la identidad más fuerte disponible; el sufijo es solo fallback.';
