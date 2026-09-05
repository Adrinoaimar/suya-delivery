-- Expand: add menu channel and per-restaurant menu configuration.
alter table public.orders add column if not exists origin text not null default 'delivery' constraint orders_origin_check check (origin in ('delivery', 'menu'));
create table if not exists public.restaurant_menu_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  public_slug text not null unique check (public_slug ~ '^[a-z0-9-]{3,80}$'), published boolean not null default false,
  logo_url text, primary_color text not null default '#ef6c3b' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#183b3b' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'), font_family text not null default 'DM Sans' check (length(font_family) between 1 and 80), hero_image_url text,
  updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
insert into public.restaurant_menu_settings (restaurant_id, public_slug)
select id, slug || '-menu' from public.restaurants
where slug is not null and length(slug) between 3 and 75
on conflict (restaurant_id) do nothing;
alter table public.restaurant_menu_settings enable row level security;
create policy restaurant_menu_settings_owner on public.restaurant_menu_settings for all to authenticated using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.restaurant_role[])) with check (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.restaurant_role[]));
create policy restaurant_menu_settings_public on public.restaurant_menu_settings for select to anon, authenticated using (published and exists (select 1 from public.restaurants r where r.id = restaurant_id and r.active));
create or replace function private.touch_menu_settings_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists restaurant_menu_settings_updated_at on public.restaurant_menu_settings;
create trigger restaurant_menu_settings_updated_at before update on public.restaurant_menu_settings for each row execute function private.touch_menu_settings_updated_at();
revoke all on public.restaurant_menu_settings from anon, authenticated;
grant select on public.restaurant_menu_settings to anon, authenticated;
grant select, insert, update, delete on public.restaurant_menu_settings to authenticated;
revoke insert, update, delete on public.orders from anon, authenticated;

create or replace function public.create_menu_order(p_restaurant_id uuid, p_items jsonb, p_customer_phone text, p_delivery_address text, p_delivery_reference text, p_request_id uuid)
returns table (order_id uuid, delivery_code text, cancel_code text)
language plpgsql security definer set search_path = '' as $$
declare result record;
begin
  if not exists (select 1 from public.restaurant_menu_settings m join public.restaurants r on r.id=m.restaurant_id where m.restaurant_id=p_restaurant_id and m.published and r.active) then raise exception 'menu is unavailable'; end if;
  select * into result from public.create_cash_order(p_restaurant_id,p_items,p_customer_phone,p_delivery_address,p_delivery_reference,p_request_id);
  update public.orders set origin='menu' where id=result.order_id and customer_id=(select auth.uid());
  return query select result.order_id,result.delivery_code,result.cancel_code;
end;
$$;
revoke execute on function public.create_menu_order(uuid,jsonb,text,text,text,uuid) from public, anon;
grant execute on function public.create_menu_order(uuid,jsonb,text,text,text,uuid) to authenticated;
comment on column public.orders.origin is 'Order acquisition channel; server-controlled: delivery or menu.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-branding', 'menu-branding', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy menu_branding_staff_insert on storage.objects for insert to authenticated
with check (bucket_id = 'menu-branding' and private.has_restaurant_role(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.restaurant_role[]));
create policy menu_branding_staff_update on storage.objects for update to authenticated
using (bucket_id = 'menu-branding' and private.has_restaurant_role(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.restaurant_role[]))
with check (bucket_id = 'menu-branding' and private.has_restaurant_role(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.restaurant_role[]));
create policy menu_branding_staff_delete on storage.objects for delete to authenticated
using (bucket_id = 'menu-branding' and private.has_restaurant_role(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.restaurant_role[]));
