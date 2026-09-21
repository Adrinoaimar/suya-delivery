-- Qualify cash-register columns because RETURNS TABLE exposes restaurant_id as
-- a PL/pgSQL variable inside open_cash_register.

create or replace function public.open_cash_register(
  p_restaurant_id uuid,
  p_opening_float numeric,
  p_request_id uuid
)
returns table (
  session_id uuid,
  restaurant_id uuid,
  status public.cash_register_status,
  opening_float numeric,
  expected_cash numeric,
  declared_cash numeric,
  difference numeric,
  opened_at timestamptz,
  closed_at timestamptz,
  entry_count bigint
)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  existing public.cash_register_sessions%rowtype;
  open_id uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if p_restaurant_id is null or not private.cash_register_can_manage(p_restaurant_id) then
    raise exception 'cash register permission required';
  end if;
  if p_request_id is null then raise exception 'request id is required'; end if;
  if p_opening_float is null or p_opening_float < 0
     or p_opening_float::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'opening float must be a non-negative amount';
  end if;

  select * into existing
  from public.cash_register_sessions s
  where s.open_request_id = p_request_id
  for update;
  if found then
    if existing.restaurant_id <> p_restaurant_id
       or existing.opened_by <> actor_id
       or round(existing.opening_float, 2) <> round(p_opening_float, 2) then
      raise exception 'cash register open request conflict';
    end if;
    return query select * from private.cash_register_snapshot(existing.id);
    return;
  end if;

  select s.id into open_id
  from public.cash_register_sessions s
  where s.restaurant_id = p_restaurant_id and s.status = 'open'
  for update;
  if open_id is not null then raise exception 'restaurant already has an open cash register'; end if;

  begin
    insert into public.cash_register_sessions (
      restaurant_id, opening_float, opened_by, open_request_id
    ) values (
      p_restaurant_id, round(p_opening_float, 2), actor_id, p_request_id
    ) returning id into open_id;
  exception when unique_violation then
    select * into existing
    from public.cash_register_sessions s
    where s.open_request_id = p_request_id
    for update;
    if found and existing.restaurant_id = p_restaurant_id
       and existing.opened_by = actor_id
       and round(existing.opening_float, 2) = round(p_opening_float, 2) then
      return query select * from private.cash_register_snapshot(existing.id);
      return;
    end if;
    raise exception 'restaurant already has an open cash register';
  end;

  return query select * from private.cash_register_snapshot(open_id);
end;
$$;
