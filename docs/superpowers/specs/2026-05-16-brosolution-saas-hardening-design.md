# BroSolution SaaS Hardening — Design Spec

**Date**: 2026-05-16
**Status**: Approved (brainstorm)
**Scope**: Single spec, multi-phase implementation. Converts `operational-grosir` from internal-tool grade into production SaaS.

---

## 1. Goals

- Close all GAP-level findings from 2026-05-16 SaaS-readiness audit: observability, billing, docs.
- Harden all PARTIAL-level findings: auth, API, security, performance, DevOps, frontend, onboarding.
- Replace placeholder home page with marketing landing page under brand **BroSolution** (ID + EN).
- Preserve existing OPTIMAL areas: multi-tenancy schema, database migration discipline.

## 2. Non-Goals (v1)

- Multi-currency
- e-Faktur pajak integration (manual export only)
- Mobile app
- Tenant-facing webhook callbacks
- Marketplace integration (Tokopedia/Shopee)
- White-label tenant branding
- Audit log UI (data captured, UI deferred)

## 3. Product Decisions

| Decision | Choice |
|---|---|
| Brand | **BroSolution** (company); `Operational Grosir` retained as product line |
| Languages | Indonesian + English with toggle (i18n) |
| Payment gateways | **Midtrans + Xendit**, with admin-selected active PSP and runtime fallback to the other configured provider when the active provider env/config is incomplete |
| Plan tiers | Free / Pro / Business (3 tiers) |
| Deploy target | **VPS + Docker Compose + Caddy** (single-region) |
| Marketing sections | Hero, logo bar/social proof, features, screenshot, pricing, FAQ, footer (skip testimonials v1) |
| Design style | Neobrutalism, consistent with existing app |
| Signup mode | Self-serve → email verify → 14-day Pro trial → checkout |
| MFA | TOTP + Email OTP fallback; mandatory for `owner` + `platform_admin` |
| Observability | Pino + Loki + Grafana + Sentry self-host + Prometheus (self-hosted on VPS) |

## 4. Plan Tier Definition

| Resource | Free | Pro | Business |
|---|---|---|---|
| Monthly price (IDR) | 0 | 299,000 | 999,000 |
| Users (cashier + manager) | 2 | 10 | Unlimited |
| Products (SKU) | 100 | 5,000 | Unlimited |
| Transactions / month | 500 | 20,000 | Unlimited |
| Export CSV / month | 5 | 100 | Unlimited |
| Outlets / branches | 1 | 3 | Unlimited |
| Data retention | 30 days | 1 year | Forever |
| Support | Community | Email <24h | Priority + WhatsApp |
| API access | No | No | Yes |
| Custom domain | No | No | Yes |
| Audit log UI | No | Yes | Yes |

## 5. Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                       Caddy (TLS, reverse proxy)            │
└────────────┬──────────────────────────┬────────────────────┘
             ↓                          ↓
   [web (Next.js 14)]            [api (Hono)]
             │                          │
             └──────┬───────────────────┤
                    ↓                   ↓
              [worker (BullMQ)]   [Postgres] [Redis]
                    │
                    ↓
             [Midtrans, Xendit, SMTP, Loki, Sentry]
```

All services run via `docker-compose` with `prod` profile on a single VPS in v1. Stateful services (Postgres, Redis) persist to host volumes. Observability stack (Loki, Grafana, Prometheus, Sentry) runs in a sibling compose project.

## 6. Phase Roadmap

| Phase | Name | Output | Dependency |
|---|---|---|---|
| P0 | Secrets + Docs foundation | `.env` removed from git, `.env.example` complete, ENV reference doc, root README, runbook stub | — |
| P1 | Observability stack | Pino structured logging, `/healthz` + `/readyz`, Sentry SDK wired, Prometheus `/metrics`, Loki + Grafana compose | P0 |
| P2 | Marketing home + i18n | Landing page (hero/features/screenshot/pricing/FAQ/footer), `next-intl` ID/EN toggle, login dropdown nav | P0 |
| P3 | Auth hardening | Login + signup + refresh rate limits, TOTP enrollment + verify, Email OTP fallback, refresh-token blacklist | P1 |
| P4 | Self-serve signup | `/signup` form, email verification, transactional tenant bootstrap, auto-trial Pro 14 days | P2, P3 |
| P5 | Billing core | Plans/Subscriptions/Invoices schema, Midtrans + Xendit checkout, webhook handlers, recurring/reminder flows, admin-selected active PSP with runtime fallback, idempotent handlers | P4 |
| P6 | Quota enforcement + dunning | `enforceQuota` middleware, usage counter rollup, UI gating + upgrade CTA, suspend-on-dunning | P5 |
| P7 | Frontend polish | Error boundaries per route, `axe-core` a11y pass, full i18n key coverage, responsive viewports CI gate | P2 |
| P8 | DevOps production | `docker-compose.prod.yml`, Caddy reverse proxy, `pg_dump` → S3-compatible backup, staging environment, CI deploy job | All prior |

## 7. Data Model Changes

New tables, additive, all tenant-scoped tables include `tenant_id` and RLS policy.

```sql
plans (
  id uuid pk,
  code text unique,           -- 'free' | 'pro' | 'business'
  name text,
  price_idr int,
  quota jsonb,                -- structured quota object
  is_active boolean,
  created_at timestamptz
);

subscriptions (
  id uuid pk,
  tenant_id uuid fk -> tenants,
  plan_id uuid fk -> plans,
  status text,                -- 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled'
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  psp_provider text nullable,         -- midtrans | xendit
  psp_subscription_id text nullable,
  created_at timestamptz,
  updated_at timestamptz
);

invoices (
  id uuid pk,
  tenant_id uuid fk,
  subscription_id uuid fk,
  amount_idr int,
  status text,                -- 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'
  psp_provider text,                  -- midtrans | xendit
  psp_order_id text unique,
  psp_transaction_id text nullable,
  payment_method text nullable,
  due_at timestamptz,
  paid_at timestamptz nullable,
  created_at timestamptz
);

usage_counters (
  tenant_id uuid fk,
  period_start date,
  metric text,                -- 'tx_count' | 'export_count'
  value bigint,
  primary key (tenant_id, period_start, metric)
);

user_mfa (
  user_id uuid fk -> users,
  method text,                -- 'totp' | 'email_otp'
  secret_encrypted text,      -- AES-256-GCM with MFA_KMS_KEY
  enabled boolean,
  enrolled_at timestamptz,
  primary key (user_id, method)
);

refresh_token_blacklist (
  jti text primary key,
  user_id uuid,
  revoked_at timestamptz,
  expires_at timestamptz
);

signup_tokens (
  token text primary key,
  email text,
  payload jsonb,              -- pending tenant + owner info
  expires_at timestamptz,
  consumed_at timestamptz nullable
);

audit_log (
  id uuid pk,
  tenant_id uuid fk nullable, -- null = platform-level event
  actor_user_id uuid nullable,
  action text,
  resource_type text,
  resource_id text,
  metadata jsonb,
  ip inet,
  created_at timestamptz
);
```

**Indexes**:
- `subscriptions(tenant_id) where status in ('trialing','active')`
- `invoices(tenant_id, status, due_at)`
- `refresh_token_blacklist(expires_at)` for purge job
- `signup_tokens(expires_at)`

**RLS**:
- `plans`: public read, platform_admin write
- `subscriptions`, `invoices`, `usage_counters`: tenant-scoped via `app.current_tenant_id`
- `user_mfa`: self + same-tenant admin
- `audit_log`: tenant rows scoped, platform rows admin-only
- `signup_tokens`: no RLS (pre-auth flow), guarded by token secrecy

## 8. Component Designs

### 8.1 Marketing Home Page (P2)

**Route**: `/` (Next.js App Router)

Sections, top to bottom:
1. **Header nav**: Logo (BroSolution), links (Fitur / Harga / FAQ), `Login` dropdown (Admin / Cari Tenant), CTA "Coba Gratis 14 Hari" → `/signup`, language toggle.
2. **Hero**: H1 + subheadline + dual CTA (primary signup, secondary "Lihat Demo"). Neobrutalism card with thick border, brutal shadow.
3. **Social proof bar**: placeholder logo grid + "Dipakai oleh UMKM se-Indonesia" tagline.
4. **Features grid** (6 cards): POS multi-outlet, manajemen stok, laporan real-time, multi-user RBAC, audit trail, export Excel/CSV.
5. **Screenshot section**: 2-column, image + caption, screenshot dari app existing.
6. **Pricing table**: 3 tier cards with quota + CTA per tier; Pro highlighted ("Paling Populer").
7. **FAQ**: 6-8 accordion items (trial, pembayaran, refund, data ownership, multi-cabang, dukungan).
8. **Footer CTA + footer**: secondary signup CTA + 4-column footer (Produk / Perusahaan / Sumber Daya / Legal) + social + kontak + login links.

i18n strategy: `next-intl`, message catalogs `messages/id.json` + `messages/en.json`. Default ID. Toggle stored in cookie `lang`.

### 8.2 Self-serve Signup Flow (P4)

```
[GET /signup]
  → form: email, password, business_name, slug
  → POST /api/v1/signup
      - validate (zod), check slug unique
      - insert signup_tokens row, expires 24h
      - enqueue email job (BullMQ)
[GET /verify?token=...]
  → POST /api/v1/signup/verify
      - consume token transactionally:
        - create tenants row
        - create users row (role=owner)
        - create subscriptions (plan=pro, status=trialing, trial_ends_at=now+14d)
        - audit_log entry
      - return tenant slug
  → redirect /t/<slug>/login?email=<prefilled>
```

### 8.3 Auth Hardening (P3)

Detailed cookie/session migration design: `docs/auth-cookie-session-architecture.md`.

- **Browser session model**: use HTTP-only secure cookies/server-side session semantics for browser auth. Do not store access or refresh tokens in `localStorage`; use `credentials: "include"`, CSRF protection on state-changing routes, and production cookie attributes `HttpOnly`, `Secure`, `SameSite=Lax` or stricter.
- **Rate limit**: Redis token-bucket via `rate-limiter-flexible`. Buckets:
  - login: 5/min/IP, 10/min/email
  - signup: 3/hour/IP
  - refresh: 30/min/user
  - mfa-verify: 5/min/user
- **TOTP**: library `otplib`. Secret stored as AES-256-GCM cipher in `user_mfa.secret_encrypted`. Encryption key from `MFA_KMS_KEY` env. Window ±1 step (30s).
- **Email OTP**: 6-digit, generated on demand, hashed (SHA-256) and stored in Redis `mfa:otp:{user_id}` with TTL 5min, max 3 attempts.
- **Enforcement**:
  - On password verify success, if user role ∈ {`owner`, `platform_admin`} and `user_mfa.enabled=true`: return `401 MFA_REQUIRED` with short-lived `challenge_token` (5min, Redis).
  - Client posts `challenge_token` + TOTP code (or Email OTP) to `/auth/mfa/verify`.
  - On success, issue access + refresh tokens.
- **Revocation**: `POST /auth/logout` writes `jti` to `refresh_token_blacklist`. Refresh handler checks blacklist before issuing new tokens. Cron purges expired rows daily.

### 8.4 Payment Provider Integration (P5)

- **Mode**: Admin selects active PSP with `BILLING_ACTIVE_PSP=midtrans|xendit`. Billing runtime uses the active PSP when configured; if its required env/config is incomplete, it falls back to the other configured PSP and logs the fallback. Midtrans uses Snap for first payment + plan changes and Subscription API where available. Xendit uses invoices/payment links and recurring/reminder workflows where available.
- **Endpoints called**:
  - `POST /snap/v1/transactions`
  - `POST /v1/subscriptions`
  - `GET /v2/{order_id}/status` (reconciliation)
- **Webhook**: `POST /api/v1/billing/midtrans/webhook`
  - Verify `signature_key = SHA512(order_id + status_code + gross_amount + server_key)`
  - Idempotent: `INSERT INTO invoices … ON CONFLICT (midtrans_order_id) DO UPDATE` on relevant fields only
  - Always return 200 after signature verify; log failure to Sentry; internal retry via queue
- **Env**: `BILLING_ACTIVE_PSP=midtrans|xendit`, `MIDTRANS_ENV=sandbox|production`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID`, `XENDIT_ENV=sandbox|production`, `XENDIT_SECRET_KEY`, `XENDIT_PUBLIC_KEY`, `XENDIT_WEBHOOK_TOKEN`
- **Reconciliation cron**: hourly job queries Midtrans for `invoices.status='pending'` older than 10 min; updates accordingly

### 8.5 Quota Enforcement (P6)

- **Middleware** `enforceQuota(metric)`: reads cached `subscriptions` row (Redis TTL 60s), checks live count vs plan quota.
- **Apply on**:
  - `POST /products` → `skus` count
  - `POST /transactions` → `tx_count` rollup
  - `POST /exports` → `export_count` rollup
  - `POST /users` (invite) → `users` count
- **Counter increment**: post-success, write to `usage_counters` via `INSERT … ON CONFLICT … DO UPDATE SET value = value + 1`.
- **Responses**:
  - Over quota: `403 { code: 'QUOTA_EXCEEDED', metric, limit, current, upgrade_url }`
  - Suspended subscription: `402 { code: 'SUBSCRIPTION_INACTIVE' }` on all non-auth routes.
- **UI**: quota usage bars on dashboard; upgrade modal on 403.

### 8.6 Observability (P1)

- **Pino**: JSON logs to stdout. Fields: `ts, level, msg, request_id, tenant_id, user_id, route, latency_ms`. Redact paths: `password, token, secret_encrypted`.
- **Promtail** sidecar tails container stdout → **Loki**.
- **Grafana** dashboards: HTTP latency, error rate, BullMQ queue depth, DB pool, Redis hit rate.
- **Sentry** (self-host docker-compose): DSN via env; source maps uploaded in CI for `web` build.
- **Prometheus** scrapes `/metrics` on `api` (prom-client default + custom): `http_request_duration_seconds`, `bullmq_job_total{queue,status}`, `db_pool_active`.
- **Health endpoints**:
  - `/healthz`: 200 if process up
  - `/readyz`: db ping + redis ping; 503 if either fails

## 9. External Interfaces

- **Email** (signup verify, MFA OTP, billing reminders, dunning): SMTP via existing `nodemailer`. Provider TBD by user; defaults to Mailpit in dev.
- **Midtrans + Xendit**: per 8.4.
- **Object storage** (P8 backup target): S3-compatible (Cloudflare R2, Wasabi, or DigitalOcean Spaces). `BACKUP_S3_*` envs.

## 10. Error Handling

- Existing `{code, message, details}` structure retained (`apps/api/src/middleware/error.ts`).
- New codes:
  - `QUOTA_EXCEEDED` (403)
  - `SUBSCRIPTION_INACTIVE` (402)
  - `MFA_REQUIRED` (401, includes `challenge_token`)
  - `MFA_INVALID` (401)
  - `RATE_LIMITED` (429, with `Retry-After` header)
  - `SIGNUP_TOKEN_INVALID` (400)
  - `SIGNUP_TOKEN_EXPIRED` (400)
  - `PAYMENT_VERIFICATION_FAILED` (400)
- Midtrans webhook: always 200 after signature verify; failures logged to Sentry + internal retry queue.
- Frontend error boundaries: per route group (`app/(auth)/error.tsx`, `app/t/[slug]/error.tsx`, `app/error.tsx`). Render branded fallback + "Coba lagi" + Sentry capture.
- Quota over-limit UX: modal with current usage + upgrade CTA, never raw error JSON.

## 11. Testing Strategy

| Phase | Unit | Integration | E2E |
|---|---|---|---|
| P0 | — | — | smoke: `pnpm migrate` on clean DB |
| P1 | Pino redaction | `/healthz`+`/readyz` dependency simulation | log shape assertions |
| P2 | i18n key resolution | — | Playwright: home renders, lang toggle, CTA nav |
| P3 | TOTP verify ± window, rate-limit bucket | login w/ MFA flow | Playwright: enroll → re-login w/ TOTP |
| P4 | signup token gen/consume | full signup transaction | Playwright: signup → verify (Mailpit) → first login |
| P5 | webhook signature verify, idempotency | Midtrans sandbox notification replay | Playwright: trial → checkout → paid → invoice list |
| P6 | quota middleware, counter increment | over-quota responses, suspension state | UI gating visible + upgrade CTA |
| P7 | error boundary fallback | axe-core a11y | responsive viewports gate (existing Phase 3 extended) |
| P8 | compose config syntax | backup restore dry-run | smoke on prod-like compose stack |

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Midtrans recurring card T+7 settle delay | High | Med | Pre-charge D-3 before period_end; UI shows pending charge |
| VA no auto-charge → tenant forgets | High | High | Reminder D-3 / D-1 / D-day; auto-suspend D+3 |
| Webhook missed → invoice stuck `pending` | Med | High | Hourly reconcile cron queries Midtrans for pending |
| Self-host Sentry/Loki ops burden | High | Med | Single compose profile; 30d retention; email alerts |
| Quota race on concurrent insert near limit | Med | Med | DB constraint + pessimistic lock when usage > 90% |
| `.env` accidentally committed in git history | Unknown until P0 audit | High | Audit current tracking and reachable history in P0; if leaked, rotate all secrets and consider `git filter-repo` cleanup |
| MFA seed plaintext if key leaks | Low | High | Key from env not DB; rotation procedure in runbook |
| Trial abuse via repeat signup | Med | Low | Rate-limit signup per IP + email domain check |
| i18n missed keys break EN UI | Med | Low | i18n linter fails CI on missing keys |
| Brand rename confuses existing tenants | Low | Low | Keep "Operational Grosir" as product line; "BroSolution" as company brand |

## 13. Migration & Rollout

- All new schema is additive — no breaking changes to existing tables.
- Existing tenants (currently admin-provisioned) get a default `subscriptions` row with `plan='business'`, `status='active'` via seed migration (grandfathered).
- Marketing page replaces current placeholder atomically with P2 deploy; no flag required.
- Auth hardening (P3): MFA enrollment is opt-in for first 30 days, then mandatory for `owner` + `platform_admin` (enforced via subscription cron + email reminders).
- Billing (P5-P6): feature-flagged with `BILLING_ENABLED` env so it can ship dark before public toggle.

## 14. Open Questions

(None blocking. Re-raise during implementation if discovered.)

## 15. References

- Audit report (conversation 2026-05-16)
- Existing files: `apps/web/src/app/page.tsx`, `apps/api/src/services/auth.service.ts`, `apps/api/src/middleware/error.ts`, `db/migrations/`, `docker-compose.yml`
