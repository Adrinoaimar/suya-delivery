-- Privacy-first, first-party daily visitor counter.
-- The browser sends a random UUID only after consent. The database stores a
-- date-scoped SHA-256 digest, never the UUID, IP, route, identity or payload.

create table if not exists public.suya_analytics_daily_visitors (
  visit_day date not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default now(),
  primary key (visit_day, visitor_hash)
);

create index if not exists suya_analytics_daily_visitors_day_idx
  on public.suya_analytics_daily_visitors (visit_day desc);

alter table public.suya_analytics_daily_visitors enable row level security;
revoke all on public.suya_analytics_daily_visitors from public, anon, authenticated;

create or replace function public.record_suya_analytics_visit(p_visitor_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor_id text := lower(trim(coalesce(p_visitor_id, '')));
  v_visit_day date := timezone('America/Lima', now())::date;
  v_visitor_hash text;
begin
  if v_visitor_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid visitor identifier';
  end if;

  v_visitor_hash := encode(
    extensions.digest(v_visitor_id || '|' || v_visit_day::text, 'sha256'),
    'hex'
  );

  insert into public.suya_analytics_daily_visitors (visit_day, visitor_hash)
  values (v_visit_day, v_visitor_hash)
  on conflict (visit_day, visitor_hash) do nothing;

  return found;
end;
$$;

revoke all on function public.record_suya_analytics_visit(text) from public;
grant execute on function public.record_suya_analytics_visit(text) to anon, authenticated;

create or replace function public.list_suya_analytics_daily(p_days integer default 30)
returns table (visit_day date, unique_visitors bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select visitors.visit_day, count(*)::bigint
  from public.suya_analytics_daily_visitors visitors
  where visitors.visit_day >= timezone('America/Lima', now())::date - (v_days - 1)
  group by visitors.visit_day
  order by visitors.visit_day desc;
end;
$$;

revoke all on function public.list_suya_analytics_daily(integer) from public;
grant execute on function public.list_suya_analytics_daily(integer) to authenticated;

comment on function public.record_suya_analytics_visit(text)
  is 'Records one consented, anonymous, date-scoped first-party visitor digest.';
comment on function public.list_suya_analytics_daily(integer)
  is 'Lists daily unique visitors for platform administrators without exposing visitor digests.';
