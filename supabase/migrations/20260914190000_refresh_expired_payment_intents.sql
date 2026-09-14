-- Renew expired manual-wallet intents without exposing a second pending attempt.

create or replace function public.refresh_payment_intent(
  p_order_id uuid,
  p_method text,
  p_guest_access_token text default null
)
returns table (
  attempt_id uuid,
  order_id uuid,
  method public.payment_method,
  status public.payment_status,
  amount numeric,
  currency text,
  checkout_reference text,
  expires_at timestamptz,
  provider text,
  qr_payload text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent record;
begin
  -- Delegate identity and amount checks to the canonical creator first.
  select * into v_intent
  from public.create_payment_intent(p_order_id, p_method, p_guest_access_token);

  if not found then return; end if;

  if v_intent.status = 'pending' and v_intent.expires_at <= now() then
    update public.payment_attempts as pa
    set status = 'failed', failure_code = 'expired', updated_at = now()
    where pa.id = v_intent.attempt_id
      and pa.status = 'pending'
      and pa.expires_at <= now();

    return query
    select * from public.create_payment_intent(p_order_id, p_method, p_guest_access_token);
    return;
  end if;

  return query select
    v_intent.attempt_id,
    v_intent.order_id,
    v_intent.method,
    v_intent.status,
    v_intent.amount,
    v_intent.currency,
    v_intent.checkout_reference,
    v_intent.expires_at,
    v_intent.provider,
    v_intent.qr_payload;
end;
$$;

revoke all on function public.refresh_payment_intent(uuid, text, text) from public;
grant execute on function public.refresh_payment_intent(uuid, text, text) to anon, authenticated;

comment on function public.refresh_payment_intent(uuid, text, text)
  is 'Returns the current wallet intent or renews one that expired, preserving one pending attempt per order.';
