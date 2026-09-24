-- Remote functions still had unqualified cash_register_entries columns,
-- despite the repository's earlier source being corrected. Replace them
-- explicitly so RETURNS TABLE variables cannot shadow SQL columns.

create or replace function public.record_cash_sale(
  p_session_id uuid,
  p_order_id uuid,
  p_received numeric,
  p_request_id uuid
)
returns table (
  entry_id uuid,
  session_id uuid,
  order_id uuid,
  amount numeric,
  received numeric,
  change numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  register_row public.cash_register_sessions%rowtype;
  order_row public.orders%rowtype;
  existing public.cash_register_entries%rowtype;
  new_entry_id uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request id is required'; end if;
  if p_received is null or p_received < 0
     or p_received::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'received amount must be non-negative';
  end if;

  select * into register_row
  from public.cash_register_sessions s
  where s.id = p_session_id
  for update;
  if not found then raise exception 'cash register session not found'; end if;
  if not private.cash_register_can_manage(register_row.restaurant_id) then
    raise exception 'cash register permission required';
  end if;
  if register_row.status <> 'open' then raise exception 'cash register is closed'; end if;

  select * into existing
  from public.cash_register_entries e
  where e.session_id = p_session_id and e.request_id = p_request_id
  for update;
  if found then
    if existing.order_id <> p_order_id
       or round(existing.gross_received, 2) <> round(p_received, 2) then
      raise exception 'cash sale request conflict';
    end if;
    return query select existing.id, existing.session_id, existing.order_id,
      existing.amount, existing.gross_received, existing.change_given;
    return;
  end if;

  select * into order_row
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then raise exception 'cash order not found'; end if;
  if order_row.restaurant_id <> register_row.restaurant_id then
    raise exception 'cash order belongs to another restaurant';
  end if;
  if order_row.payment_method <> 'cash'::public.payment_method then
    raise exception 'only cash orders can be recorded in the register';
  end if;
  if order_row.status <> 'delivered' then
    raise exception 'cash order must be delivered before collection';
  end if;
  if order_row.cash_register_session_id is not null then
    raise exception 'cash order already recorded';
  end if;
  if p_received < order_row.total then
    raise exception 'received amount is insufficient';
  end if;

  begin
    insert into public.cash_register_entries (
      session_id, restaurant_id, entry_type, order_id, amount,
      gross_received, change_given, request_id, actor_id, note
    ) values (
      register_row.id, register_row.restaurant_id, 'cash_sale', order_row.id,
      round(order_row.total, 2), round(p_received, 2),
      round(p_received - order_row.total, 2), p_request_id, actor_id,
      'Cobro de pedido'
    ) returning id into new_entry_id;
  exception when unique_violation then
    select * into existing
    from public.cash_register_entries e
    where e.order_id = order_row.id and e.entry_type = 'cash_sale'
    for update;
    if found and existing.session_id = p_session_id
       and round(existing.gross_received, 2) = round(p_received, 2) then
      return query select existing.id, existing.session_id, existing.order_id,
        existing.amount, existing.gross_received, existing.change_given;
      return;
    end if;
    raise exception 'cash order already recorded';
  end;

  update public.orders o
  set cash_register_session_id = register_row.id,
      cash_collected_at = now(),
      cash_collected_by = actor_id
  where o.id = order_row.id;

  return query select new_entry_id, register_row.id, order_row.id,
    round(order_row.total, 2), round(p_received, 2),
    round(p_received - order_row.total, 2);
end;
$$;

create or replace function public.add_cash_adjustment(
  p_session_id uuid,
  p_amount numeric,
  p_note text,
  p_request_id uuid
)
returns table (entry_id uuid, session_id uuid, amount numeric, note text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  register_row public.cash_register_sessions%rowtype;
  existing public.cash_register_entries%rowtype;
  new_entry_id uuid;
  clean_note text := btrim(coalesce(p_note, ''));
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request id is required'; end if;
  if p_amount is null or p_amount = 0
     or p_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'adjustment must be a non-zero amount';
  end if;
  if length(clean_note) < 3 then raise exception 'adjustment note is required'; end if;

  select * into register_row
  from public.cash_register_sessions s
  where s.id = p_session_id
  for update;
  if not found then raise exception 'cash register session not found'; end if;
  if not private.cash_register_can_manage(register_row.restaurant_id) then
    raise exception 'cash register permission required';
  end if;
  if register_row.status <> 'open' then raise exception 'cash register is closed'; end if;

  select * into existing
  from public.cash_register_entries e
  where e.session_id = p_session_id and e.request_id = p_request_id
  for update;
  if found then
    if round(existing.amount, 2) <> round(p_amount, 2)
       or existing.note <> clean_note then
      raise exception 'cash adjustment request conflict';
    end if;
    return query select existing.id, existing.session_id, existing.amount, existing.note;
    return;
  end if;

  insert into public.cash_register_entries (
    session_id, restaurant_id, entry_type, amount, request_id, actor_id, note
  ) values (
    register_row.id, register_row.restaurant_id, 'adjustment', round(p_amount, 2),
    p_request_id, actor_id, clean_note
  ) returning id into new_entry_id;

  return query select new_entry_id, register_row.id, round(p_amount, 2), clean_note;
end;
$$;

revoke all on function public.record_cash_sale(uuid, uuid, numeric, uuid)
  from public, anon;
grant execute on function public.record_cash_sale(uuid, uuid, numeric, uuid)
  to authenticated;
revoke all on function public.add_cash_adjustment(uuid, numeric, text, uuid)
  from public, anon;
grant execute on function public.add_cash_adjustment(uuid, numeric, text, uuid)
  to authenticated;
