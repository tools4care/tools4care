#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
read -r -s -p "Database password: " TERMINAL_DB_PASSWORD
printf '\n'
trap 'unset TERMINAL_DB_PASSWORD' EXIT

DB_URL="host=aws-0-us-east-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.gvloygqbavibmpakzdma sslmode=require"
PGPASSWORD="$TERMINAL_DB_PASSWORD" psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/202608140002_terminal_card_foundation.sql

PGPASSWORD="$TERMINAL_DB_PASSWORD" psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  v_tenant_id uuid;
  v_count integer;
begin
  select count(*) into v_count
  from public.tenants
  where lower(business_name) in ('tools4care', 'tools4care llc')
     or lower(business_name) like 'tools4care %';

  if v_count = 1 then
    select id into v_tenant_id
    from public.tenants
    where lower(business_name) in ('tools4care', 'tools4care llc')
       or lower(business_name) like 'tools4care %'
    limit 1;
  elsif v_count > 1 then
    raise exception 'Found multiple tenants named Tools4Care; no feature setting was created';
  end if;

  -- Existing installations can use a business name different from the app
  -- brand. Prefer the one tenant actually assigned to customer records.
  if v_tenant_id is null then
    select count(distinct tenant_id) into v_count
    from public.clientes
    where tenant_id is not null;
    if v_count = 1 then
      select tenant_id into v_tenant_id
      from public.clientes
      where tenant_id is not null
      limit 1;
    elsif v_count > 1 then
      raise exception 'Customers belong to multiple tenants; no tenant was selected automatically';
    end if;
  end if;

  -- Final safe fallback: use the only active tenant in the project.
  if v_tenant_id is null then
    select count(*) into v_count
    from public.tenants
    where active is true and coalesce(status, 'active') = 'active';
    if v_count = 1 then
      select id into v_tenant_id
      from public.tenants
      where active is true and coalesce(status, 'active') = 'active'
      limit 1;
    end if;
  end if;

  insert into public.terminal_payment_settings(
    scope_key, tenant_id, android_tap_to_pay_enabled, saved_cards_enabled,
    stripe_location_id, pilot_device_ids
  ) values (
    case when v_tenant_id is null then 'legacy' else 'tenant:' || v_tenant_id::text end,
    v_tenant_id, false, false, 'tml_GnyW5wVIFQXpyA', '{}'
  )
  on conflict (scope_key) do update set
    stripe_location_id = excluded.stripe_location_id,
    -- Never disable a live pilot when this recovery script is rerun.
    android_tap_to_pay_enabled = terminal_payment_settings.android_tap_to_pay_enabled,
    saved_cards_enabled = terminal_payment_settings.saved_cards_enabled,
    updated_at = now();
end $$;

select coalesce(t.business_name, 'Tools4Care legacy installation') as business_name, s.scope_key, s.stripe_location_id,
       s.android_tap_to_pay_enabled, s.saved_cards_enabled
from public.terminal_payment_settings s
left join public.tenants t on t.id = s.tenant_id
where s.stripe_location_id = 'tml_GnyW5wVIFQXpyA';
SQL

echo "Terminal payment foundation installed. Tap to Pay remains disabled."
