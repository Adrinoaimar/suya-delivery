-- Qualify entry columns in the internal table-sale helper. This function has
-- no public return table, but explicit qualification keeps future refactors
-- from colliding with PL/pgSQL variables or record fields.

create or replace function private.record_table_cash_sale(
  p_table_session_id uuid,
  p_received numeric,
  p_request_id uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  table_row public.table_sessions%rowtype;
  register_row public.cash_register_sessions%rowtype;
  existing public.cash_register_entries%rowtype;
begin
  if p_request_id is null then raise exception 'request id is required'; end if;
  select * into table_row from public.table_sessions where id = p_table_session_id for update;
  if not found then raise exception 'session not found'; end if;
  if p_received is null or p_received < table_row.total
     or p_received::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'received amount is insufficient';
  end if;
  select * into register_row
  from public.cash_register_sessions s
  where s.restaurant_id = table_row.restaurant_id and s.status = 'open'
  order by s.opened_at desc
  limit 1
  for update;
  if not found then raise exception 'open cash register required for cash table payment'; end if;

  select * into existing
  from public.cash_register_entries e
  where e.session_id = register_row.id and e.request_id = p_request_id
  for update;
  if found then
    if existing.table_session_id <> p_table_session_id
       or round(existing.gross_received, 2) <> round(p_received, 2) then
      raise exception 'cash sale request conflict';
    end if;
    return;
  end if;

  insert into public.cash_register_entries (
    session_id, restaurant_id, entry_type, table_session_id, amount,
    gross_received, change_given, request_id, actor_id, note
  ) values (
    register_row.id, table_row.restaurant_id, 'cash_sale', p_table_session_id,
    round(table_row.total, 2), round(p_received, 2),
    round(p_received - table_row.total, 2), p_request_id,
    (select auth.uid()), 'Cobro de mesa'
  );
exception when unique_violation then
  select * into existing
  from public.cash_register_entries e
  where e.table_session_id = p_table_session_id
  for update;
  if found and existing.session_id = register_row.id
     and round(existing.gross_received, 2) = round(p_received, 2) then
    return;
  end if;
  raise exception 'table cash sale already recorded';
end;
$$;
