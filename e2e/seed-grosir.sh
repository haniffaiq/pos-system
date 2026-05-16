#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:4000}"
ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@example.test}"
ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-admin123}"
SLUG="${E2E_GROSIR_SLUG:-e2e-grosir-$(date +%s)-${RANDOM:-0}}"

cookie_jar=$(mktemp)
trap 'rm -f "$cookie_jar"' EXIT

curl -fsS "$API_BASE_URL/api/v1/auth/admin-login" \
  -H 'content-type: application/json' \
  -c "$cookie_jar" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  >/dev/null

csrf_token=$(awk '$6 == "brs_csrf" { print $7 }' "$cookie_jar" | tail -n 1)
if [ -z "$csrf_token" ]; then
  echo "missing CSRF cookie after admin login" >&2
  exit 1
fi

curl -fsS "$API_BASE_URL/api/v1/admin/tenants" \
  -b "$cookie_jar" \
  -H 'content-type: application/json' \
  -H "x-csrf-token: $csrf_token" \
  -d "{\"name\":\"E2E Grosir\",\"slug\":\"$SLUG\",\"sector\":\"grosir\",\"ownerEmail\":\"owner@$SLUG.com\",\"ownerPassword\":\"secret12\"}" \
  >/dev/null

# Quota-gated routes require a tenant subscription. The billing seed is
# idempotent and backfills a default business subscription for newly seeded
# tenants; keep stdout clean because the caller captures only the slug.
if [ -n "${DATABASE_ADMIN_URL:-}" ]; then
  pnpm seed:plans >/dev/null
fi

echo "$SLUG"
