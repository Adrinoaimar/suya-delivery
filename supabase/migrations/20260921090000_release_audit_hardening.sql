-- Correcciones de release: la última redefinición de la auditoría debe conservar
-- la exclusión de PII de pedidos, y los flujos de caja deben explicar cuentas
-- receptoras inactivas sin revelar datos sensibles.

create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value jsonb;
  old_value jsonb;
  new_value jsonb;
begin
  row_value := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_value := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_value := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  if tg_table_name = 'payment_attempts' then
    old_value := old_value - array[
      'idempotency_key', 'provider_reference', 'payer_code_digest',
      'payer_code_hmac', 'payer_code_hmac_context', 'payer_code_last4'
    ];
    new_value := new_value - array[
      'idempotency_key', 'provider_reference', 'payer_code_digest',
      'payer_code_hmac', 'payer_code_hmac_context', 'payer_code_last4'
    ];
  elsif tg_table_name = 'orders' then
    old_value := old_value - array[
      'customer_name', 'customer_phone', 'delivery_address', 'delivery_reference',
      'delivery_latitude', 'delivery_longitude', 'idempotency_key'
    ];
    new_value := new_value - array[
      'customer_name', 'customer_phone', 'delivery_address', 'delivery_reference',
      'delivery_latitude', 'delivery_longitude', 'idempotency_key'
    ];
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (
    (select auth.uid()), tg_table_name,
    coalesce(row_value ->> 'id', concat_ws(':', row_value ->> 'restaurant_id', row_value ->> 'user_id')),
    tg_op, old_value, new_value
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Redact historical order PII left by the overwritten trigger definition.
update public.audit_log
set old_data = old_data - array[
      'customer_name', 'customer_phone', 'delivery_address', 'delivery_reference',
      'delivery_latitude', 'delivery_longitude', 'idempotency_key'
    ],
    new_data = new_data - array[
      'customer_name', 'customer_phone', 'delivery_address', 'delivery_reference',
      'delivery_latitude', 'delivery_longitude', 'idempotency_key'
    ]
where table_name = 'orders';

create or replace function public.create_wallet_observer_device_for_account(
  p_restaurant_id uuid,
  p_receiver_account_id uuid,
  p_label text
)
returns table (
  device_id uuid,
  device_label text,
  device_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id uuid := extensions.gen_random_uuid();
  v_label text;
  v_account_active boolean;
begin
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(
      p_restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;
  select account.active into v_account_active
  from public.restaurant_payment_accounts account
  where account.id = p_receiver_account_id
    and account.restaurant_id = p_restaurant_id;
  if not found then raise exception 'receiver payment account is invalid'; end if;
  if not v_account_active then raise exception 'receiver payment account is inactive'; end if;

  v_label := nullif(left(regexp_replace(trim(coalesce(p_label, '')), '\s+', ' ', 'g'), 80), '');
  if v_label is null then raise exception 'device label is required'; end if;

  v_token := v_id::text || '.' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.wallet_observer_devices (
    id, restaurant_id, receiver_account_id, label, token_hash, token_last4, created_by
  ) values (
    v_id, p_restaurant_id, p_receiver_account_id, v_label,
    extensions.crypt(v_token, extensions.gen_salt('bf')), right(v_token, 4), auth.uid()
  );
  return query select v_id, v_label, v_token;
end;
$$;

create or replace function public.create_wallet_observer_pairing(
  p_restaurant_id uuid,
  p_receiver_account_id uuid,
  p_label text
)
returns table (
  pairing_id uuid,
  pairing_code text,
  expires_at timestamptz,
  restaurant_id uuid,
  receiver_account_id uuid,
  device_label text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
  v_label text := nullif(left(regexp_replace(trim(coalesce(p_label, '')), '\s+', ' ', 'g'), 80), '');
  v_pairing_id uuid := extensions.gen_random_uuid();
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_account_active boolean;
begin
  if not (
    private.is_platform_admin()
    or private.has_restaurant_role(
      p_restaurant_id,
      array['owner', 'manager']::public.restaurant_role[]
    )
  ) then
    raise exception 'not authorized';
  end if;
  if v_label is null then raise exception 'device label is required'; end if;
  select account.active into v_account_active
  from public.restaurant_payment_accounts account
  where account.id = p_receiver_account_id
    and account.restaurant_id = p_restaurant_id;
  if not found then raise exception 'receiver payment account is invalid'; end if;
  if not v_account_active then raise exception 'receiver payment account is inactive'; end if;

  update public.wallet_observer_pairings as pairing
  set consumed_at = now()
  where pairing.restaurant_id = p_restaurant_id
    and pairing.receiver_account_id = p_receiver_account_id
    and pairing.consumed_at is null
    and pairing.expires_at > now();

  insert into public.wallet_observer_pairings (
    id, restaurant_id, receiver_account_id, label, code_hash, expires_at, created_by
  ) values (
    v_pairing_id, p_restaurant_id, p_receiver_account_id, v_label,
    extensions.crypt(lower(v_code), extensions.gen_salt('bf')), v_expires_at,
    (select auth.uid())
  );

  return query select v_pairing_id, v_code, v_expires_at,
    p_restaurant_id, p_receiver_account_id, v_label;
end;
$$;
