# Environment Variables Reference

All variables are read from `.env` during local development and injected by the deployment environment in production. Keep `.env` untracked; use `.env.example` for placeholder-only examples.

## Naming compatibility

Use the runtime names already read by the codebase. Do not rename these without adding compatibility in code:

- Auth secrets: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
- Token TTLs: `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL` (seconds).
- SMTP password: `SMTP_PASSWORD`.
- Billing provider selector: `BILLING_ACTIVE_PSP` (`midtrans` or `xendit`).

Avoid older/planned aliases such as `JWT_SECRET`, `ACCESS_TTL_SEC`, `REFRESH_TTL_SEC`, `SMTP_PASS`, or `BILLING_ACTIVE_PROVIDER` unless a future PR adds explicit runtime compatibility.

## Core database, Redis, and queues

| Key | Required | Example | Notes |
|---|---:|---|---|
| `POSTGRES_DB` | dev compose | `operational` | Local Docker Compose database name. |
| `POSTGRES_USER` | dev compose | `postgres` | Local superuser for bootstrap only. |
| `POSTGRES_PASSWORD` | dev compose | `change_me_postgres_password` | Local placeholder; do not commit real values. |
| `POSTGRES_APP_USER` | dev compose | `app` | Runtime app role. |
| `POSTGRES_APP_PASSWORD` | dev compose | `change_me_app_password` | Used to build local app connection strings. |
| `POSTGRES_ADMIN_USER` | dev compose | `app_admin` | Migration/admin role. |
| `POSTGRES_ADMIN_PASSWORD` | dev compose | `change_me_admin_password` | Used to build local admin connection strings. |
| `DATABASE_URL` | yes | `postgres://app:***@db:5432/operational` | App-role Postgres connection. |
| `DATABASE_ADMIN_URL` | yes | `postgres://app_admin:***@db:5432/operational` | Admin/migration Postgres connection. |
| `REDIS_URL` | yes | `redis://redis:6379` | Redis for queues, cache, rate limits, and future sessions. |
| `BULLMQ_QUEUE_PREFIX` | no | `brosolution` | Optional queue namespace. |
| `EXPORT_DIR` | no | `/data/exports` | Filesystem export root used by reports/export jobs. |

## API and web runtime

| Key | Required | Example | Notes |
|---|---:|---|---|
| `API_PORT` | no | `4000` | API listen port; defaults to 4000. |
| `CORS_ORIGINS` | yes | `http://localhost:3000,https://app.brosolution.id` | Comma-separated allowed web origins. |
| `PUBLIC_APP_URL` | yes | `https://app.brosolution.id` | Public web URL used in emails and callbacks. |
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost:4000` | Browser-visible API base URL for Next.js; leave empty in the production Caddy setup for same-origin `/api/v1` calls. |
| `DOMAIN` | prod compose | `app.brosolution.id` | Public hostname terminated by Caddy in `docker-compose.prod.yml`. |
| `ACME_EMAIL` | prod compose | `ops@brosolution.id` | Email Caddy passes to the ACME issuer for certificate notices. |

## Auth and session hardening

| Key | Required | Example | Notes |
|---|---:|---|---|
| `JWT_ACCESS_SECRET` | yes | 48-byte base64 string | Current access-token signing secret. |
| `JWT_REFRESH_SECRET` | yes | 48-byte base64 string | Current refresh-token signing secret. |
| `ACCESS_TOKEN_TTL` | no | `900` | Access-token TTL in seconds. |
| `REFRESH_TOKEN_TTL` | no | `1209600` | Refresh-token TTL in seconds. |
| `MFA_KMS_KEY` | P3 | 32-byte base64 string | AES-GCM key for encrypted TOTP seeds. |
| `SESSION_COOKIE_NAME` | no | `brosolution_session` | HTTP-only access/session cookie name; runtime default is `brs_access` if unset. |
| `SESSION_COOKIE_DOMAIN` | prod | `.brosolution.id` | Cookie domain; leave empty for localhost. |
| `SESSION_COOKIE_SECURE` | prod | `true` | Secure-cookie flag; true by default when `NODE_ENV=production`. |
| `CSRF_COOKIE_NAME` | P3 | `brosolution_csrf` | Reserved non-HTTP-only CSRF token cookie name for double-submit protection; current runtime cookie is `brs_csrf`. |
| `CSRF_HEADER_NAME` | P3 | `x-csrf-token` | Reserved request header for state-changing requests; current runtime header is `x-csrf-token`. |
| `AUTH_MFA_BYPASS_EMAILS` | dev/test only | `owner@example.test` | Optional MFA bypass allow-list for tests and local development only; API startup refuses it when `NODE_ENV=production` or `APP_ENV=production`. Do not set in production. |
| `MFA_CHALLENGE_RATE_LIMIT_POINTS` | no | `5` | Max MFA challenge send/verify attempts per challenge token and per user inside the rate-limit window. |
| `MFA_CHALLENGE_RATE_LIMIT_SECONDS` | no | `60` | MFA challenge rate-limit window in seconds. |
| `MFA_CHALLENGE_MAX_FAILURES` | no | `5` | Failed MFA verification attempts before the challenge is deleted/locked out. |

P3 browser auth must move to HTTP-only secure cookie/server-side session semantics. Do not continue storing access or refresh tokens in `localStorage`; browser API calls should use `credentials: "include"` and CSRF protection on state-changing requests.

## Email / SMTP

| Key | Required | Example | Notes |
|---|---:|---|---|
| `SMTP_HOST` | yes | `mailpit` | Mailpit in dev; provider host in prod. |
| `SMTP_PORT` | yes | `1025` | `587` or provider-specific port in prod. |
| `SMTP_SECURE` | no | `false` | Set `true` for implicit TLS providers. |
| `SMTP_USER` | prod | `postmaster@example` | Optional in local Mailpit. |
| `SMTP_PASSWORD` | prod | `change_me_smtp_password` | Runtime name used by code; not `SMTP_PASS`. |
| `SMTP_FROM` | yes | `BroSolution <no-reply@brosolution.id>` | Sender address for transactional email. |

## Billing PSPs (P5)

| Key | Required | Example | Notes |
|---|---:|---|---|
| `BILLING_ENABLED` | no | `false` | Feature flag; can ship billing dark before public enablement. |
| `BILLING_ACTIVE_PSP` | P5 | `midtrans` or `xendit` | Admin-selected preferred PSP. Runtime must fall back to the other configured PSP when active PSP env/config is incomplete. |
| `MIDTRANS_ENV` | if Midtrans configured | `sandbox` or `production` | Midtrans environment. |
| `MIDTRANS_SERVER_KEY` | if Midtrans configured | `change_me_midtrans_server_key` | Server-side API and webhook signature verification. |
| `MIDTRANS_CLIENT_KEY` | if Midtrans configured | `change_me_midtrans_client_key` | Snap client initialization. |
| `MIDTRANS_MERCHANT_ID` | if Midtrans configured | `G123456789` | Merchant identifier. |
| `XENDIT_ENV` | if Xendit configured | `sandbox` or `production` | Xendit environment. |
| `XENDIT_SECRET_KEY` | if Xendit configured | `change_me_xendit_secret_key` | Server-side API key. |
| `XENDIT_PUBLIC_KEY` | if Xendit configured | `change_me_xendit_public_key` | Client-side payment UI if needed. |
| `XENDIT_WEBHOOK_TOKEN` | if Xendit configured | `change_me_xendit_webhook_token` | Webhook verification token. |

Both Midtrans and Xendit must be supportable. A deployment may configure one or both providers, but billing runtime must validate provider readiness before selecting the active provider and must log fallback decisions.

## Observability (P1)

| Key | Required | Example | Notes |
|---|---:|---|---|
| `SENTRY_DSN` | prod | `https://example@sentry.brosolution.id/1` | API/worker Sentry DSN; empty disables Sentry initialization. |
| `SENTRY_ENVIRONMENT` | no | `staging` | API/worker Sentry environment tag; falls back to `NODE_ENV`. |
| `SENTRY_RELEASE` | no | `api@2026.05.16` | Sentry release tag for API and as web fallback. |
| `NEXT_PUBLIC_SENTRY_DSN` | prod web | `https://example@sentry.brosolution.id/2` | Browser-visible Sentry DSN for Next.js. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | no | `production` | Browser-visible Sentry environment tag; falls back to `NODE_ENV`. |
| `NEXT_PUBLIC_SENTRY_RELEASE` | no | `web@2026.05.16` | Browser-visible Sentry release tag; falls back to `SENTRY_RELEASE`. |
| `LOG_LEVEL` | no | `info` | `trace`, `debug`, `info`, `warn`, or `error`. |
| `PROMETHEUS_METRICS_ENABLED` | P1 | `true` | `/metrics` exposure flag for the API. |
| `LOKI_URL` | P1 | `http://loki:3100` | Log shipping target if app-side shipping is added; Promtail currently tails Docker stdout. |
| `GRAFANA_ADMIN_USER` | observability compose | `admin` | Initial Grafana admin user; rotate before any shared/prod deployment. |
| `GRAFANA_ADMIN_PASSWORD` | observability compose | `change_me_grafana_password` | Initial Grafana admin password; must be set to a real secret outside git. |
| `GRAFANA_BIND` | no | `127.0.0.1:3001` | Local-only Grafana bind by default; expose via Caddy/TLS in prod. |
| `PROMETHEUS_BIND` | no | `127.0.0.1:9090` | Local-only Prometheus bind by default. |
| `LOKI_BIND` | no | `127.0.0.1:3100` | Local-only Loki bind by default. |
| `PROMETHEUS_RETENTION` | no | `30d` | Prometheus TSDB retention for the compose volume. |

Run the observability stack with the app compose file so Prometheus can scrape `api:4000`: `docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability up -d`. Dev defaults bind UIs to localhost; production should put Grafana/Prometheus behind Caddy/TLS instead of widening these binds.

## Backup (P8)

| Key | Required | Example | Notes |
|---|---:|---|---|
| `BACKUP_S3_ENDPOINT` | prod/P8 | `https://s3.amazonaws.com` | S3-compatible endpoint (AWS S3, R2, Wasabi, Spaces). |
| `BACKUP_S3_BUCKET` | prod/P8 | `brosolution-backups` | Backup bucket name. |
| `BACKUP_S3_REGION` | prod/P8 | `ap-southeast-1` | Region or provider-specific placeholder. |
| `BACKUP_S3_ACCESS_KEY` | prod/P8 | `change_me_backup_access_key` | Least-privilege write/read key for backup prefix. |
| `BACKUP_S3_SECRET_KEY` | prod/P8 | `change_me_backup_secret_key` | Matching secret key. |
| `BACKUP_S3_PREFIX` | no | `prod/` | Optional object prefix. |
| `BACKUP_RETENTION_DAYS` | no | `30` | Planned retention policy for backup automation. |

## E2E and CI helpers

| Key | Required | Example | Notes |
|---|---:|---|---|
| `E2E_ADMIN_EMAIL` | e2e | `admin@local` | Playwright admin login. |
| `E2E_ADMIN_PASSWORD` | e2e | `replace-me-admin-password` | Playwright admin password. |
| `E2E_BASE_URL` | e2e | `http://localhost:3000` | Legacy/base E2E URL. |
| `E2E_GROSIR_OWNER_PASSWORD` | e2e | `replace-me-owner-password` | Grosir owner password in seeded data. |
| `E2E_GROSIR_SLUG` | e2e | `demo` | Tenant slug for Grosir E2E flows. |
| `PLAYWRIGHT_BASE_URL` | e2e | `http://localhost:3000` | Playwright base URL; preferred by current config. |
