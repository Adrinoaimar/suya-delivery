-- Privacy-safe aggregate telemetry for page views and link clicks.
-- No visitor id, cookie, IP, referrer, query string or user identity is stored.

create table if not exists public.suya_analytics_daily_events (
  event_day date not null,
  event_name text not null check (event_name in ('page_view', 'link_click')),
  event_key text not null check (event_key ~ '^[a-z0-9/_:-]{1,100}$'),
  event_count bigint not null default 0 check (event_count >= 0 and event_count <= 1000000),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (event_day, event_name, event_key)
);

create index if not exists suya_analytics_daily_events_day_idx
  on public.suya_analytics_daily_events (event_day desc, event_name);

alter table public.suya_analytics_daily_events enable row level security;
revoke all on public.suya_analytics_daily_events from public, anon, authenticated;

create or replace function public.record_suya_analytics_event(
  p_event_name text,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_day date := timezone('America/Lima', now())::date;
  v_event_name text := lower(trim(coalesce(p_event_name, '')));
  v_event_key text := lower(trim(coalesce(p_event_key, '')));
begin
  if v_event_name not in ('page_view', 'link_click') then
    raise exception 'invalid analytics event';
  end if;

  if v_event_key !~ '^[a-z0-9/_:-]{1,100}$' then
    raise exception 'invalid analytics event key';
  end if;

  insert into public.suya_analytics_daily_events (
    event_day,
    event_name,
    event_key,
    event_count
  )
  values (v_event_day, v_event_name, v_event_key, 1)
  on conflict (event_day, event_name, event_key) do update
    set event_count = least(public.suya_analytics_daily_events.event_count + 1, 1000000),
        last_seen_at = now();
end;
$$;

revoke all on function public.record_suya_analytics_event(text, text) from public;
grant execute on function public.record_suya_analytics_event(text, text) to anon, authenticated;

create or replace function public.list_suya_analytics_events(p_days integer default 30)
returns table (
  event_day date,
  event_name text,
  event_key text,
  event_count bigint
)
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
  select events.event_day, events.event_name, events.event_key, events.event_count
  from public.suya_analytics_daily_events events
  where events.event_day >= timezone('America/Lima', now())::date - (v_days - 1)
  order by events.event_day desc, events.event_name, events.event_key;
end;
$$;

revoke all on function public.list_suya_analytics_events(integer) from public;
grant execute on function public.list_suya_analytics_events(integer) to authenticated;

comment on function public.record_suya_analytics_event(text, text)
  is 'Records one privacy-safe aggregate page view or link click without visitor identifiers.';
comment on function public.list_suya_analytics_events(integer)
  is 'Lists aggregate page views and link clicks for platform administrators.';
