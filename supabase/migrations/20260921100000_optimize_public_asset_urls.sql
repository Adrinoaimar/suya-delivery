-- Replaces legacy raw.githubusercontent.com assets with first-party paths.
-- The web client maps the heavy PNG paths to the equivalent WebP files locally.
update public.restaurants
set image_url = '/images/stores/donde-joel/cover.png',
    logo_url = '/images/stores/donde-joel/logo.png',
    updated_at = now()
where slug = 'donde-joel'
  and (
    image_url like 'https://raw.githubusercontent.com/%'
    or logo_url like 'https://raw.githubusercontent.com/%'
  );

update public.restaurant_menu_settings settings
set logo_url = '/images/stores/donde-joel/logo.png',
    hero_image_url = '/images/stores/donde-joel/menus/carta-01.jpg',
    updated_at = now()
from public.restaurants restaurant
where settings.restaurant_id = restaurant.id
  and restaurant.slug = 'donde-joel'
  and (
    settings.logo_url like 'https://raw.githubusercontent.com/%'
    or settings.hero_image_url like 'https://raw.githubusercontent.com/%'
  );

with normalized as (
  select
    restaurant.id,
    coalesce(
      jsonb_agg(
        case
          when item.value->>'src' like 'https://raw.githubusercontent.com/%' then
            jsonb_set(
              item.value,
              '{src}',
              to_jsonb(replace(item.value->>'src', 'https://raw.githubusercontent.com/Adrinoaimar/suya-delivery/main/public', ''))
            )
          else item.value
        end
        order by item.ordinality
      ),
      '[]'::jsonb
    ) as gallery
  from public.restaurants restaurant
  left join lateral jsonb_array_elements(coalesce(restaurant.gallery, '[]'::jsonb)) with ordinality as item(value, ordinality)
    on true
  where restaurant.slug = 'donde-joel'
  group by restaurant.id
)
update public.restaurants restaurant
set gallery = normalized.gallery,
    updated_at = now()
from normalized
where restaurant.id = normalized.id
  and restaurant.slug = 'donde-joel';
