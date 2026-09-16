-- Expose only the configured label of the exact active receiver account.
-- The label helps the customer verify the destination; it is not payment proof.
create or replace function public.get_payment_receiver_label(
  p_order_id uuid,
  p_guest_access_token text default null
)
returns table (account_label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_guest_ok boolean := false;
  v_label text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return; end if;

  if v_order.customer_id is null then
    select exists (
      select 1
      from private.order_secrets s
      where s.order_id = v_order.id
        and p_guest_access_token is not null
        and length(p_guest_access_token) between 32 and 128
        and s.guest_access_token_hash is not null
        and extensions.crypt(p_guest_access_token, s.guest_access_token_hash) = s.guest_access_token_hash
    ) into v_guest_ok;
    if not v_guest_ok then return; end if;
  elsif (select auth.uid()) is null or v_order.customer_id <> (select auth.uid()) then
    return;
  end if;

  select pa.* into v_attempt
  from public.payment_attempts pa
  where pa.order_id = v_order.id
  order by pa.created_at desc
  limit 1;
  if not found then return; end if;

  if v_attempt.receiver_account_id is not null then
    select rpa.account_label into v_label
    from public.restaurant_payment_accounts rpa
    where rpa.id = v_attempt.receiver_account_id
      and rpa.restaurant_id = v_order.restaurant_id
      and rpa.active;
  else
    select rpa.account_label into v_label
    from public.restaurant_payment_accounts rpa
    where rpa.restaurant_id = v_order.restaurant_id
      and rpa.provider = v_attempt.method::text
      and rpa.active;
  end if;

  if v_label is null then return; end if;
  return query select v_label;
end;
$$;

revoke all on function public.get_payment_receiver_label(uuid, text) from public;
grant execute on function public.get_payment_receiver_label(uuid, text) to anon, authenticated;

comment on function public.get_payment_receiver_label(uuid, text) is
  'Returns only the active exact receiver label to the order owner or valid guest token.';
