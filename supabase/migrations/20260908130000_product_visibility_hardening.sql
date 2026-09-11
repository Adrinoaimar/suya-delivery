-- Active products are public only while their restaurant is active.
-- Staff and platform admins retain access to inactive catalog rows they manage.

drop policy if exists products_anon_select on public.products;
create policy products_anon_select
  on public.products
  for select to anon
  using (
    active
    and exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id and r.active
    )
  );

drop policy if exists products_authenticated_select on public.products;
create policy products_authenticated_select
  on public.products
  for select to authenticated
  using (
    (
      active
      and exists (
        select 1
        from public.restaurants r
        where r.id = restaurant_id and r.active
      )
    )
    or private.is_restaurant_member(restaurant_id)
    or private.is_platform_admin()
  );

comment on policy products_anon_select on public.products is
  'Only active products belonging to active restaurants are public.';
