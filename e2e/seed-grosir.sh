#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:4000}"
ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@example.test}"
ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-admin123}"
SLUG="${E2E_GROSIR_SLUG:-e2e-grosir-$(date +%s%N)}"

login_response=$(curl -fsS "$API_BASE_URL/api/v1/auth/admin-login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(node -e 'const chunks=[]; process.stdin.on("data", c => chunks.push(c)); process.stdin.on("end", () => { const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!body.accessToken) process.exit(1); process.stdout.write(body.accessToken); });' <<<"$login_response")

curl -fsS "$API_BASE_URL/api/v1/admin/tenants" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"E2E Grosir\",\"slug\":\"$SLUG\",\"sector\":\"grosir\",\"ownerEmail\":\"owner@$SLUG.com\",\"ownerPassword\":\"secret12\"}" \
  >/dev/null

echo "$SLUG"
