-- Guest checkout must remain available, but each source needs a bounded rate.
-- The request headers are supplied by Supabase's gateway; clients cannot choose
-- the gateway address used for this bucket. Only a digest is persisted.
create table if not exists private.guest_order_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

revoke all on private.guest_order_rate_limits from public, anon, authenticated;

create or replace function private.consume_guest_order_rate_limit(target_restaurant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_headers jsonb;
  source_address text;
  key_material text;
  hashed_key text;
  current_window timestamptz;
  current_count integer;
begin
  if target_restaurant is null then raise exception 'restaurant is required'; end if;

  begin
    request_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    request_headers := '{}'::jsonb;
  end;

  source_address := left(
    coalesce(request_headers ->> 'x-real-ip', request_headers ->> 'x-forwarded-for', 'unknown'),
    256
  );
  key_material := target_restaurant::text || '|' || source_address;
  hashed_key := encode(extensions.digest(key_material, 'sha256'), 'hex');

  insert into private.guest_order_rate_limits (rate_key, window_started_at, request_count)
  values (hashed_key, now(), 1)
  on conflict (rate_key) do update
  set window_started_at = case
        when private.guest_order_rate_limits.window_started_at <= now() - interval '10 minutes' then now()
        else private.guest_order_rate_limits.window_started_at
      end,
      request_count = case
        when private.guest_order_rate_limits.window_started_at <= now() - interval '10 minutes' then 1
        else private.guest_order_rate_limits.request_count + 1
      end,
      updated_at = now()
  returning window_started_at, request_count into current_window, current_count;

  if current_window > now() - interval '10 minutes' and current_count > 30 then
    raise exception 'guest order rate limit exceeded' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.consume_guest_order_rate_limit(uuid) from public, anon, authenticated;

create or replace function private.enforce_guest_order_rate_limit_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is null and new.origin in ('menu', 'table_qr') then
    perform private.consume_guest_order_rate_limit(new.restaurant_id);
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_guest_order_rate_limit_on_insert() from public, anon, authenticated;

drop trigger if exists guest_order_rate_limit on public.orders;
create trigger guest_order_rate_limit
before insert on public.orders
for each row execute function private.enforce_guest_order_rate_limit_on_insert();
