-- QR por mesa: sesiones acumuladas y cobro en caja.
-- El token es un identificador público rotatorio, no una credencial privilegiada.
create type public.table_status as enum ('available', 'occupied', 'awaiting_payment', 'paid');
create type public.table_session_status as enum ('open', 'payment_pending', 'paid', 'closed');

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number text not null check (length(btrim(table_number)) between 1 and 30),
  qr_token text not null unique check (length(qr_token) >= 24),
  status public.table_status not null default 'available',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, table_number)
);

create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  status public.table_session_status not null default 'open',
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  total numeric(10,2) not null default 0 check (total >= 0),
  paid_amount numeric(10,2) check (paid_amount is null or paid_amount >= 0),
  change_amount numeric(10,2) check (change_amount is null or change_amount >= 0),
  payment_method public.payment_method,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_at is null or closed_at >= opened_at),
  check (paid_amount is null or paid_amount >= total)
);

create unique index table_sessions_one_open_per_table
  on public.table_sessions(table_id)
  where status in ('open', 'payment_pending');
create index restaurant_tables_restaurant_idx on public.restaurant_tables(restaurant_id, active);
create index table_sessions_restaurant_status_idx on public.table_sessions(restaurant_id, status);

alter table public.orders add column table_id uuid references public.restaurant_tables(id) on delete set null;
alter table public.orders add column table_session_id uuid references public.table_sessions(id) on delete set null;
create index orders_table_session_idx on public.orders(table_session_id, created_at);

create trigger restaurant_tables_updated_at before update on public.restaurant_tables
for each row execute function private.set_updated_at();
create trigger table_sessions_updated_at before update on public.table_sessions
for each row execute function private.set_updated_at();

alter table public.restaurant_tables enable row level security;
alter table public.table_sessions enable row level security;

create policy restaurant_tables_public_select on public.restaurant_tables
  for select to anon, authenticated using (active and exists (
    select 1 from public.restaurants r where r.id = restaurant_id and r.active
  ));
create policy restaurant_tables_staff_all on public.restaurant_tables
  for all to authenticated using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','kitchen']::public.restaurant_role[])
    or private.is_platform_admin()
  ) with check (
    private.has_restaurant_role(restaurant_id, array['owner','manager','kitchen']::public.restaurant_role[])
    or private.is_platform_admin()
  );
create policy table_sessions_participant_select on public.table_sessions
  for select to authenticated using (
    opened_by = (select auth.uid()) or private.is_restaurant_member(restaurant_id)
    or exists (select 1 from public.orders o where o.table_session_id = id and o.customer_id = (select auth.uid()))
    or private.is_platform_admin()
  );
create policy table_sessions_staff_update on public.table_sessions
  for update to authenticated using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','kitchen']::public.restaurant_role[])
    or private.is_platform_admin()
  ) with check (
    private.has_restaurant_role(restaurant_id, array['owner','manager','kitchen']::public.restaurant_role[])
    or private.is_platform_admin()
  );

grant select on public.restaurant_tables to anon, authenticated;
grant select on public.table_sessions to authenticated;
grant update (status, closed_at, paid_amount, change_amount, payment_method, paid_at, total, subtotal)
  on public.table_sessions to authenticated;

create or replace function public.resolve_table_qr(p_token text)
returns table (table_id uuid, restaurant_id uuid, table_number text, restaurant_name text, session_id uuid)
language sql security definer set search_path = '' stable as $$
  select t.id, t.restaurant_id, t.table_number, r.name, s.id
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id and r.active
  left join public.table_sessions s on s.table_id = t.id and s.status in ('open','payment_pending')
  where t.qr_token = btrim(p_token) and t.active;
$$;
revoke all on function public.resolve_table_qr(text) from public;
grant execute on function public.resolve_table_qr(text) to anon, authenticated;

create or replace function public.open_table_session(p_table_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_restaurant uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select restaurant_id into v_restaurant from public.restaurant_tables where id = p_table_id and active for update;
  if v_restaurant is null then raise exception 'table unavailable'; end if;
  select id into v_session from public.table_sessions where table_id = p_table_id and status in ('open','payment_pending') limit 1;
  if v_session is null then
    insert into public.table_sessions (restaurant_id, table_id, opened_by) values (v_restaurant, p_table_id, auth.uid()) returning id into v_session;
    update public.restaurant_tables set status = 'occupied' where id = p_table_id;
  end if;
  return v_session;
end; $$;
revoke all on function public.open_table_session(uuid) from public;
grant execute on function public.open_table_session(uuid) to authenticated;

create or replace function public.register_table_payment(p_session_id uuid, p_received numeric, p_method public.payment_method default 'cash')
returns table (session_id uuid, total numeric, received numeric, change numeric)
language plpgsql security definer set search_path = '' as $$
declare s public.table_sessions%rowtype; v_change numeric;
begin
  select * into s from public.table_sessions where id = p_session_id for update;
  if not found then raise exception 'session not found'; end if;
  if not private.has_restaurant_role(s.restaurant_id, array['owner','manager']::public.restaurant_role[]) and not private.is_platform_admin() then
    raise exception 'cashier role required';
  end if;
  if s.status not in ('open','payment_pending') then raise exception 'session is already closed'; end if;
  if p_received is null or p_received < s.total then raise exception 'received amount is insufficient'; end if;
  if exists (select 1 from public.orders o where o.table_session_id = s.id and o.status not in ('delivered','cancelled')) then
    raise exception 'all orders must be delivered or cancelled';
  end if;
  v_change := round(p_received - s.total, 2);
  update public.table_sessions set status='paid', paid_amount=p_received, change_amount=v_change,
    payment_method=p_method, paid_at=now(), closed_at=now() where id=s.id;
  update public.restaurant_tables set status='paid' where id=s.table_id;
  return query select s.id, s.total, p_received, v_change;
end; $$;
revoke all on function public.register_table_payment(uuid,numeric,public.payment_method) from public;
grant execute on function public.register_table_payment(uuid,numeric,public.payment_method) to authenticated;

alter publication supabase_realtime add table public.restaurant_tables;
alter publication supabase_realtime add table public.table_sessions;
