-- A single authenticated owner may manage more than one restaurant profile.
-- restaurant_id remains the registry's primary key; restaurant_members keeps
-- one owner membership per restaurant and user.
drop index if exists public.restaurant_account_registry_owner_idx;
