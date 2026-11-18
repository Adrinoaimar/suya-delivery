-- Conserva las configuraciones para revisión y retira Yape/Lemon de nuevos cobros sin conciliar.
do $$
declare
  v_restaurant uuid;
  v_slug text;
  v_options record;
begin
  for v_slug in select unnest(array['anda-paya', 'donde-joel']) loop
    select r.id into v_restaurant from public.restaurants r where r.slug = v_slug;
    if not found then continue; end if;

    if exists (
      select 1 from public.orders o
      join public.payment_attempts a on a.order_id = o.id
      where o.restaurant_id = v_restaurant and a.method in ('yape', 'lemon')
        and a.status = 'pending' and a.expires_at > now()
        and a.provider in ('static_qr', 'wallet_observer')
    ) then
      raise exception 'Hay cobros vigentes en %; revisar antes de pausar medios.', v_slug;
    end if;

    update public.payment_gateway_configs
    set active = false, updated_at = now()
    where restaurant_id = v_restaurant and active and provider = 'static_qr';

    update public.restaurant_payment_accounts
    set active = false, updated_at = now()
    where restaurant_id = v_restaurant and active and provider in ('yape', 'lemon');

    select * into strict v_options from public.get_public_checkout_payment_options(v_restaurant);
    if v_options.active_provider <> 'cash_only'
      or v_options.supports_yape or v_options.supports_lemon or v_options.supports_card then
      raise exception 'El checkout de % aún ofrece medios que requieren validación.', v_slug;
    end if;
  end loop;
end;
$$;
