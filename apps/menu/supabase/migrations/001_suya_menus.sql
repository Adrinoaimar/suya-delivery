-- Suya Menús: tenant-safe catalog. Run in Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.menu_stores (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'), name text not null, logo_url text,
  primary_color text not null default '#ef6c3b', accent_color text not null default '#183b3b',
  font_family text not null default 'DM Sans', is_published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.menu_stores(id) on delete cascade,
  name text not null, sort_order integer not null default 0, is_active boolean not null default true,
  unique(store_id,name)
);
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.menu_stores(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null, name text not null,
  description text not null default '', price numeric(12,2) not null check (price >= 0), image_url text,
  is_available boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.menu_promotions (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.menu_stores(id) on delete cascade,
  title text not null, description text not null default '', discount_percent numeric(5,2) check (discount_percent between 0 and 100),
  starts_at timestamptz, ends_at timestamptz, is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.menu_coupons (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.menu_stores(id) on delete cascade,
  code text not null, discount_percent numeric(5,2) check (discount_percent between 0 and 100), max_uses integer check (max_uses > 0), uses_count integer not null default 0,
  starts_at timestamptz, ends_at timestamptz, is_active boolean not null default true, unique(store_id,code)
);
alter table public.menu_stores enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_promotions enable row level security;
alter table public.menu_coupons enable row level security;
create policy "owner stores" on public.menu_stores for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "public published stores" on public.menu_stores for select using (is_published = true);
create policy "owner categories" on public.menu_categories for all using (exists(select 1 from menu_stores s where s.id=store_id and s.owner_id=auth.uid())) with check (exists(select 1 from menu_stores s where s.id=store_id and s.owner_id=auth.uid()));
create policy "public active categories" on public.menu_categories for select using (exists(select 1 from menu_stores s where s.id=store_id and s.is_published) and is_active);
create policy "owner items" on public.menu_items for all using (exists(select 1 from menu_stores s where s.id=store_id and s.owner_id=auth.uid())) with check (exists(select 1 from menu_stores s where s.id=store_id and s.owner_id=auth.uid()));
create policy "public available items" on public.menu_items for select using (is_available and exists(select 1 from menu_stores s where s.id=store_id and s.is_published));
create policy "owner promotions" on public.menu_promotions for all using (exists(select 1 from menu_stores s where s.id=store_id and s.owner_id=auth.uid())) with check (exists(select 1 from menu_stores s where s.id=store_id and s.owner_id=auth.uid()));
create policy "public active promotions" on public.menu_promotions for select using (is_active and exists(select 1 from menu_stores s where s.id=store_id and s.is_published));
create policy "owner coupons" on public.menu_coupons for all using (exists(select 1 from menu_stores s where s.id=store_id and s.owner_id=auth.uid())) with check (exists(select 1 from menu_stores s where s.id=store_id and s.owner_id=auth.uid()));
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists stores_touch on public.menu_stores; create trigger stores_touch before update on public.menu_stores for each row execute function public.touch_updated_at();
drop trigger if exists items_touch on public.menu_items; create trigger items_touch before update on public.menu_items for each row execute function public.touch_updated_at();
