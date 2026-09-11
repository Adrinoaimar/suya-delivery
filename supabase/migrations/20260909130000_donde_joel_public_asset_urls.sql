-- Keep the confirmed Donde Joel profile reproducible when the app is bootstrapped.
-- The repository serves these assets from the public main branch until the
-- Cloudflare Pages deployment has its production token configured.
update public.restaurants
set image_url = 'https://raw.githubusercontent.com/Adrinoaimar/suya-delivery/main/public/images/stores/donde-joel/cover.png',
    logo_url = 'https://raw.githubusercontent.com/Adrinoaimar/suya-delivery/main/public/images/stores/donde-joel/logo.png',
    gallery = jsonb_build_array(
      jsonb_build_object(
        'src', 'https://raw.githubusercontent.com/Adrinoaimar/suya-delivery/main/public/images/stores/donde-joel/menus/carta-01.jpg',
        'caption', 'Carta 1: ceviches, marinos, criollos, dúos y rondas'
      ),
      jsonb_build_object(
        'src', 'https://raw.githubusercontent.com/Adrinoaimar/suya-delivery/main/public/images/stores/donde-joel/menus/carta-02.jpg',
        'caption', 'Carta 2: fast food, pollo, chaufas y platos amazónicos'
      ),
      jsonb_build_object(
        'src', 'https://raw.githubusercontent.com/Adrinoaimar/suya-delivery/main/public/images/stores/donde-joel/menus/carta-03.jpg',
        'caption', 'Carta 3: tequeños, alitas, parrillas y familiares'
      ),
      jsonb_build_object(
        'src', 'https://raw.githubusercontent.com/Adrinoaimar/suya-delivery/main/public/images/stores/donde-joel/menus/carta-04.jpg',
        'caption', 'Carta 4: bebidas e infusiones'
      )
    )
where id = '23000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1
    from public.restaurants
    where id = '23000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'No existe Donde Joel (23000000-0000-4000-8000-000000000001)';
  end if;
end;
$$;
