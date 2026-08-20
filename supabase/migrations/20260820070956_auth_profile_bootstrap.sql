create or replace function private.bootstrap_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_display_name text;
begin
  profile_display_name := pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(
        new.raw_user_meta_data ->> 'display_name',
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
      )),
      '[[:cntrl:]]+',
      ' ',
      'g'
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(profile_display_name) < 2 then
    profile_display_name := pg_catalog.regexp_replace(
      pg_catalog.btrim(pg_catalog.split_part(coalesce(new.email, ''), '@', 1)),
      '[[:cntrl:][:space:]]+',
      ' ',
      'g'
    );
  end if;

  if pg_catalog.char_length(profile_display_name) < 2 then
    profile_display_name := 'Usuario';
  end if;

  profile_display_name := pg_catalog.left(profile_display_name, 120);

  insert into public.profiles (id, display_name)
  values (new.id, profile_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.bootstrap_auth_profile() from public, anon, authenticated;

drop trigger if exists auth_user_profile_bootstrap on auth.users;
create trigger auth_user_profile_bootstrap
  after insert on auth.users
  for each row execute function private.bootstrap_auth_profile();
