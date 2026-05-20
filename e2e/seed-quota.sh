#!/usr/bin/env bash
set -euo pipefail

OWNER_PASSWORD="${E2E_QUOTA_OWNER_PASSWORD:-secret12}"
RUN_ID="$(date +%s)-${RANDOM:-0}"
FREE_SLUG="${E2E_QUOTA_FREE_SLUG:-quota-free-${RUN_ID}}"
INACTIVE_SLUG="${E2E_QUOTA_INACTIVE_SLUG:-quota-inactive-${RUN_ID}}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required to seed quota e2e tenants" >&2
  exit 1
fi

PASSWORD_HASH=$(node -e 'const argon2 = require("argon2"); argon2.hash(process.argv[1]).then((hash) => process.stdout.write(hash));' "$OWNER_PASSWORD")

# Ensure plan rows exist before replacing the fixture tenants' default business
# subscriptions with the exact states required by the Playwright gate.
pnpm seed:plans >/dev/null

PGOPTIONS='-c app.platform_mode=on' psql "$DATABASE_URL" --set ON_ERROR_STOP=1 \
  --set free_slug="$FREE_SLUG" \
  --set inactive_slug="$INACTIVE_SLUG" \
  --set password_hash="$PASSWORD_HASH" <<'SQL' >/dev/null
with fixture_input(slug, name) as (
  values (:'free_slug', 'E2E Quota Free'), (:'inactive_slug', 'E2E Quota Inactive')
), fixture_tenants as (
  insert into tenants (name, slug, sector)
  select name, slug, 'grosir' from fixture_input
  on conflict (slug) do update set name = excluded.name, status = 'active'
  returning id, slug
), fixture_users as (
  insert into users (tenant_id, email, password_hash, name, role)
  select id, 'owner@' || slug || '.com', :'password_hash', name || ' Owner', 'owner'
  from fixture_tenants
  join fixture_input using (slug)
  on conflict (tenant_id, email) do update set password_hash = excluded.password_hash, status = 'active'
), deleted_subscriptions as (
  delete from subscriptions where tenant_id in (select id from fixture_tenants)
), fixture_units as (
  insert into units (tenant_id, name)
  select id, 'pcs' from fixture_tenants
  on conflict (tenant_id, name) do update set name = excluded.name
  returning tenant_id, id
), free_subscription as (
  insert into subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
  select tenant.id, plan.id, 'active', now(), now() + interval '30 days'
  from fixture_tenants tenant
  join plans plan on plan.code = 'free'
  where tenant.slug = :'free_slug'
), inactive_subscription as (
  insert into subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
  select tenant.id, plan.id, 'suspended', now() - interval '30 days', now() - interval '1 day'
  from fixture_tenants tenant
  join plans plan on plan.code = 'free'
  where tenant.slug = :'inactive_slug'
), seeded_products as (
  insert into products (tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock)
  select tenant.id,
         'FREE-' || lpad(n::text, 3, '0'),
         'Free quota product ' || n,
         unit.id,
         1000,
         1500,
         0,
         1
  from fixture_tenants tenant
  join fixture_units unit on unit.tenant_id = tenant.id
  cross join generate_series(1, 100) as n
  where tenant.slug = :'free_slug'
  on conflict (tenant_id, sku) do nothing
)
insert into usage_counters (tenant_id, period_start, metric, value)
select tenant.id, date_trunc('month', now())::date, 'skus', 100
from fixture_tenants tenant
where tenant.slug = :'free_slug'
on conflict (tenant_id, period_start, metric) do update
set value = excluded.value, updated_at = now();
SQL

cat <<EOF
E2E_QUOTA_FREE_SLUG=$FREE_SLUG
E2E_QUOTA_INACTIVE_SLUG=$INACTIVE_SLUG
E2E_QUOTA_OWNER_PASSWORD=$OWNER_PASSWORD
EOF
