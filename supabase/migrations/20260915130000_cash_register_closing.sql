-- Cierre de caja por restaurante y turno.
-- El saldo esperado se calcula en Postgres; el navegador solo declara el efectivo contado.

alter table public.table_sessions
  add column if not exists payment_request_id uuid;
create unique index if not exists table_sessions_payment_request_uidx
  on public.table_sessions (payment_request_id)
  where payment_request_id is not null;

create type public.cash_register_status as enum ('open', 'closed');
create type public.cash_register_entry_type as enum ('cash_sale', 'cash_refund', 'adjustment');

create table public.cash_register_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  status public.cash_register_status not null default 'open',
  opening_float numeric(10,2) not null default 0 check (opening_float >= 0),
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  declared_cash numeric(10,2),
  expected_cash numeric(10,2),
  difference numeric(10,2),
  close_note text not null default '',
  open_request_id uuid not null unique,
  close_request_id uuid unique,
  updated_at timestamptz not null default now(),
  check (
    (status = 'open' and closed_by is null and closed_at is null
      and declared_cash is null and expected_cash is null and difference is null)
    or
    (status = 'closed' and closed_by is not null and closed_at is not null
      and declared_cash is not null and expected_cash is not null and difference is not null)
  )
);

create unique index cash_register_one_open_restaurant_uidx
  on public.cash_register_sessions (restaurant_id)
  where status = 'open';

create table public.cash_register_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.cash_register_sessions(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  entry_type public.cash_register_entry_type not null,
  order_id uuid references public.orders(id) on delete restrict,
  table_session_id uuid references public.table_sessions(id) on delete restrict,
  amount numeric(10,2) not null check (amount <> 0),
  gross_received numeric(10,2) not null default 0 check (gross_received >= 0),
  change_given numeric(10,2) not null default 0 check (change_given >= 0),
  request_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (order_id is null or table_session_id is null),
  check (
    (entry_type = 'cash_sale'
      and amount > 0
      and gross_received >= amount
      and change_given = round(gross_received - amount, 2)
      and (order_id is not null or table_session_id is not null))
    or
    (entry_type = 'cash_refund'
      and amount < 0
      and gross_received = 0
      and change_given = 0
      and order_id is not null)
    or
    (entry_type = 'adjustment'
      and gross_received = 0
      and change_given = 0
      and order_id is null
      and table_session_id is null
      and length(btrim(note)) >= 3)
  )
);

create unique index cash_register_request_uidx
  on public.cash_register_entries (session_id, request_id);
create unique index cash_register_sale_order_uidx
  on public.cash_register_entries (order_id)
  where entry_type = 'cash_sale' and order_id is not null;
create unique index cash_register_sale_table_session_uidx
  on public.cash_register_entries (table_session_id)
  where entry_type = 'cash_sale' and table_session_id is not null;
create index cash_register_entries_session_created_idx
  on public.cash_register_entries (session_id, created_at desc);
create index cash_register_sessions_restaurant_opened_idx
  on public.cash_register_sessions (restaurant_id, opened_at desc);

alter table public.orders
  add column if not exists cash_register_session_id uuid
    references public.cash_register_sessions(id) on delete set null;
alter table public.orders
  add column if not exists cash_collected_at timestamptz;
alter table public.orders
  add column if not exists cash_collected_by uuid references auth.users(id) on delete set null;
create index if not exists orders_cash_register_session_idx
  on public.orders (cash_register_session_id)
  where cash_register_session_id is not null;

create trigger cash_register_sessions_updated_at before update on public.cash_register_sessions
for each row execute function private.set_updated_at();
create trigger cash_register_sessions_audit after insert or update on public.cash_register_sessions
for each row execute function private.write_audit_log();
create trigger cash_register_entries_audit after insert on public.cash_register_entries
for each row execute function private.write_audit_log();

alter table public.cash_register_sessions enable row level security;
alter table public.cash_register_entries enable row level security;

create policy cash_register_sessions_staff_select on public.cash_register_sessions
  for select to authenticated using (
    private.is_platform_admin()
    or private.has_restaurant_role(
      restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    )
  );
create policy cash_register_entries_staff_select on public.cash_register_entries
  for select to authenticated using (
    private.is_platform_admin()
    or private.has_restaurant_role(
      restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    )
  );

revoke all on public.cash_register_sessions from public, anon, authenticated;
revoke all on public.cash_register_entries from public, anon, authenticated;
grant select on public.cash_register_sessions, public.cash_register_entries to authenticated;

create function private.cash_register_snapshot(p_session_id uuid)
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
language sql stable security definer set search_path = ''
as $$
  select
    s.id,
    s.restaurant_id,
    s.status,
    s.opening_float,
    coalesce(
      s.expected_cash,
      round(s.opening_float + coalesce(sum(e.amount), 0), 2)
    ),
    s.declared_cash,
    s.difference,
    s.opened_at,
    s.closed_at,
    count(e.id)
  from public.cash_register_sessions s
  left join public.cash_register_entries e on e.session_id = s.id
  where s.id = p_session_id
  group by s.id, s.restaurant_id, s.status, s.opening_float, s.expected_cash,
    s.declared_cash, s.difference, s.opened_at, s.closed_at;
$$;

create function private.cash_register_can_manage(p_restaurant_id uuid)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select private.is_platform_admin()
    or private.has_restaurant_role(
      p_restaurant_id, array['owner', 'manager']::public.restaurant_role[]
    );
$$;

create function public.list_cash_register_sessions(p_restaurant_ids uuid[])
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
language sql stable security definer set search_path = ''
as $$
  select snapshot.*
  from unnest(coalesce(p_restaurant_ids, array[]::uuid[])) requested(id)
  join public.cash_register_sessions s on s.restaurant_id = requested.id
  cross join lateral private.cash_register_snapshot(s.id) snapshot
  where private.cash_register_can_manage(s.restaurant_id)
  order by snapshot.opened_at desc
  limit 30;
$$;

create function public.open_cash_register(
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
  from public.cash_register_sessions
  where open_request_id = p_request_id
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

  select id into open_id
  from public.cash_register_sessions
  where restaurant_id = p_restaurant_id and status = 'open'
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
    from public.cash_register_sessions
    where open_request_id = p_request_id
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

create function private.record_table_cash_sale(
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
  from public.cash_register_sessions
  where restaurant_id = table_row.restaurant_id and status = 'open'
  order by opened_at desc
  limit 1
  for update;
  if not found then raise exception 'open cash register required for cash table payment'; end if;

  select * into existing
  from public.cash_register_entries
  where session_id = register_row.id and request_id = p_request_id
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
  from public.cash_register_entries
  where table_session_id = p_table_session_id
  for update;
  if found and existing.session_id = register_row.id
     and round(existing.gross_received, 2) = round(p_received, 2) then
    return;
  end if;
  raise exception 'table cash sale already recorded';
end;
$$;

-- Reemplaza la RPC existente manteniendo la firma de tres argumentos como wrapper.
create or replace function public.register_table_payment(
  p_session_id uuid,
  p_received numeric,
  p_method public.payment_method,
  p_request_id uuid
)
returns table (session_id uuid, total numeric, received numeric, change numeric)
language plpgsql security definer set search_path = ''
as $$
declare
  s public.table_sessions%rowtype;
  v_change numeric;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request id is required'; end if;
  select * into s from public.table_sessions where id = p_session_id for update;
  if not found then raise exception 'session not found'; end if;
  if not private.has_restaurant_role(
    s.restaurant_id, array['owner', 'manager']::public.restaurant_role[]
  ) and not private.is_platform_admin() then
    raise exception 'cashier role required';
  end if;
  if p_method is null then raise exception 'payment method is required'; end if;
  if s.status = 'paid' then
    if s.payment_request_id = p_request_id
       and s.paid_amount = p_received
       and s.payment_method = p_method then
      return query select s.id, s.total, s.paid_amount, s.change_amount;
      return;
    end if;
    raise exception 'session is already closed';
  end if;
  if s.status not in ('open', 'payment_pending') then
    raise exception 'session is already closed';
  end if;
  if p_received is null or p_received < s.total
     or p_received::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'received amount is insufficient';
  end if;
  if exists (
    select 1 from public.orders o
    where o.table_session_id = s.id and o.status not in ('delivered', 'cancelled')
  ) then
    raise exception 'all orders must be delivered or cancelled';
  end if;
  v_change := round(p_received - s.total, 2);
  if p_method = 'cash'::public.payment_method then
    perform private.record_table_cash_sale(s.id, p_received, p_request_id);
  end if;
  update public.table_sessions set
    status = 'paid', paid_amount = p_received, change_amount = v_change,
    payment_method = p_method, payment_request_id = p_request_id,
    paid_at = now(), closed_at = now()
  where id = s.id;
  update public.restaurant_tables set status = 'paid' where id = s.table_id;
  return query select s.id, s.total, p_received, v_change;
end;
$$;

create or replace function public.register_table_payment(
  p_session_id uuid,
  p_received numeric,
  p_method public.payment_method default 'cash'
)
returns table (session_id uuid, total numeric, received numeric, change numeric)
language plpgsql security definer set search_path = ''
as $$
begin
  return query select * from public.register_table_payment(
    p_session_id, p_received, p_method, extensions.gen_random_uuid()
  );
end;
$$;

create function public.record_cash_sale(
  p_session_id uuid,
  p_order_id uuid,
  p_received numeric,
  p_request_id uuid
)
returns table (entry_id uuid, session_id uuid, order_id uuid, amount numeric, received numeric, change numeric)
language plpgsql security definer set search_path = ''
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
  select * into register_row from public.cash_register_sessions
  where id = p_session_id for update;
  if not found then raise exception 'cash register session not found'; end if;
  if not private.cash_register_can_manage(register_row.restaurant_id) then
    raise exception 'cash register permission required';
  end if;
  if register_row.status <> 'open' then raise exception 'cash register is closed'; end if;

  select * into existing from public.cash_register_entries
  where session_id = p_session_id and request_id = p_request_id for update;
  if found then
    if existing.order_id <> p_order_id
       or round(existing.gross_received, 2) <> round(p_received, 2) then
      raise exception 'cash sale request conflict';
    end if;
    return query select existing.id, existing.session_id, existing.order_id,
      existing.amount, existing.gross_received, existing.change_given;
    return;
  end if;

  select * into order_row from public.orders where id = p_order_id for update;
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
  if p_received < order_row.total then raise exception 'received amount is insufficient'; end if;

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
    select * into existing from public.cash_register_entries
    where order_id = order_row.id and entry_type = 'cash_sale' for update;
    if found and existing.session_id = p_session_id
       and round(existing.gross_received, 2) = round(p_received, 2) then
      return query select existing.id, existing.session_id, existing.order_id,
        existing.amount, existing.gross_received, existing.change_given;
      return;
    end if;
    raise exception 'cash order already recorded';
  end;

  update public.orders set
    cash_register_session_id = register_row.id,
    cash_collected_at = now(),
    cash_collected_by = actor_id
  where id = order_row.id;
  return query select new_entry_id, register_row.id, order_row.id,
    round(order_row.total, 2), round(p_received, 2),
    round(p_received - order_row.total, 2);
end;
$$;

create function public.add_cash_adjustment(
  p_session_id uuid,
  p_amount numeric,
  p_note text,
  p_request_id uuid
)
returns table (entry_id uuid, session_id uuid, amount numeric, note text)
language plpgsql security definer set search_path = ''
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
  select * into register_row from public.cash_register_sessions
  where id = p_session_id for update;
  if not found then raise exception 'cash register session not found'; end if;
  if not private.cash_register_can_manage(register_row.restaurant_id) then
    raise exception 'cash register permission required';
  end if;
  if register_row.status <> 'open' then raise exception 'cash register is closed'; end if;
  select * into existing from public.cash_register_entries
  where session_id = p_session_id and request_id = p_request_id for update;
  if found then
    if round(existing.amount, 2) <> round(p_amount, 2) or existing.note <> clean_note then
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

create function public.close_cash_register(
  p_session_id uuid,
  p_declared_cash numeric,
  p_close_note text,
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
  register_row public.cash_register_sessions%rowtype;
  expected numeric;
  difference_value numeric;
  clean_note text := btrim(coalesce(p_close_note, ''));
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request id is required'; end if;
  if p_declared_cash is null or p_declared_cash < 0
     or p_declared_cash::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'declared cash must be a non-negative amount';
  end if;
  select * into register_row from public.cash_register_sessions
  where id = p_session_id for update;
  if not found then raise exception 'cash register session not found'; end if;
  if not private.cash_register_can_manage(register_row.restaurant_id) then
    raise exception 'cash register permission required';
  end if;
  if register_row.status = 'closed' then
    if register_row.close_request_id = p_request_id then
      return query select * from private.cash_register_snapshot(register_row.id);
      return;
    end if;
    raise exception 'cash register is already closed';
  end if;
  expected := round(register_row.opening_float + coalesce((
    select sum(e.amount) from public.cash_register_entries e where e.session_id = register_row.id
  ), 0), 2);
  difference_value := round(p_declared_cash - expected, 2);
  if difference_value <> 0 and length(clean_note) < 3 then
    raise exception 'close note is required when cash differs';
  end if;
  update public.cash_register_sessions set
    status = 'closed', closed_by = actor_id, closed_at = now(),
    declared_cash = round(p_declared_cash, 2), expected_cash = expected,
    difference = difference_value, close_note = clean_note,
    close_request_id = p_request_id
  where id = register_row.id;
  return query select * from private.cash_register_snapshot(register_row.id);
end;
$$;

revoke all on function private.cash_register_snapshot(uuid) from public, anon, authenticated;
revoke all on function private.cash_register_can_manage(uuid) from public, anon, authenticated;
revoke all on function private.record_table_cash_sale(uuid,numeric,uuid) from public, anon, authenticated;
revoke all on function public.list_cash_register_sessions(uuid[]) from public, anon;
revoke all on function public.open_cash_register(uuid,numeric,uuid) from public, anon;
revoke all on function public.record_cash_sale(uuid,uuid,numeric,uuid) from public, anon;
revoke all on function public.add_cash_adjustment(uuid,numeric,text,uuid) from public, anon;
revoke all on function public.close_cash_register(uuid,numeric,text,uuid) from public, anon;
revoke all on function public.register_table_payment(uuid,numeric,public.payment_method,uuid) from public, anon;
revoke all on function public.register_table_payment(uuid,numeric,public.payment_method) from public, anon;
grant execute on function public.list_cash_register_sessions(uuid[]) to authenticated;
grant execute on function public.open_cash_register(uuid,numeric,uuid) to authenticated;
grant execute on function public.record_cash_sale(uuid,uuid,numeric,uuid) to authenticated;
grant execute on function public.add_cash_adjustment(uuid,numeric,text,uuid) to authenticated;
grant execute on function public.close_cash_register(uuid,numeric,text,uuid) to authenticated;
grant execute on function public.register_table_payment(uuid,numeric,public.payment_method,uuid) to authenticated;
grant execute on function public.register_table_payment(uuid,numeric,public.payment_method) to authenticated;

alter publication supabase_realtime add table public.cash_register_sessions;
alter publication supabase_realtime add table public.cash_register_entries;

comment on table public.cash_register_sessions is
  'Turnos de caja por restaurante. El cierre conserva efectivo declarado, esperado y diferencia.';
comment on function public.close_cash_register(uuid,numeric,text,uuid) is
  'Cierra un turno de caja con saldo esperado calculado por servidor e idempotencia por solicitud.';
