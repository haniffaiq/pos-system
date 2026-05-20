# Shared-Infra Prep — Postgres / Redis / MinIO

**Date:** 2026-05-20
**Status:** Approved

## Problem

PostgreSQL, Redis, and MinIO run as a single shared instance used by this app plus
three other apps. This repo currently bundles its own `db` and `redis` containers
and provisions roles via container init scripts. It must instead connect to the
shared instance using credentials supplied in `.env`, without colliding with the
other three apps.

Supplied credential shape (example):

```
DATABASE_URL=postgresql://postyb:<pw>@postgres:5432/postyb
REDIS_URL=redis://postyb:<pw>@redis:6379/0   # keys must be prefixed postyb:
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=postybkey
MINIO_SECRET_KEY=<secret>
MINIO_BUCKET=postyb
```

Each app gets one identity (`postyb` here — a per-app namespace value), one
Postgres database, Redis DB 0 with an ACL restricting keys to `<namespace>:*`,
and one MinIO bucket. Hostnames `postgres` / `redis` / `minio` resolve only on a
shared Docker network.

## Decisions

- **Postgres:** one role only. Replace the two-role (NOBYPASSRLS / BYPASSRLS) model
  with a single role plus a `app.platform_mode` session GUC for platform bypass.
- **Redis:** isolate via `keyPrefix` (DB 0 is shared; the ACL mandates a key prefix).
- **MinIO:** used only as the backup target by `infra/backup/*.sh`. Report exports
  stay on the local `exports` volume — out of scope.
- **docker-compose:** all environments (dev, staging, prod) connect to the shared
  instance. Bundled `db` / `redis` containers are removed everywhere.
- **Docker network:** external, name supplied by the instance owner via the
  `SHARED_NETWORK` env var.

## 1. Postgres — single role + platform-mode GUC

### Current model
- `tenantPool` (`DATABASE_URL`, role `app`, NOBYPASSRLS) — RLS-enforced tenant queries.
- `adminPool` (`DATABASE_ADMIN_URL`, role `app_admin`, BYPASSRLS) — cross-tenant /
  platform queries and migrations.
- RLS tables use `enable row level security` only. Policies key off
  `current_setting('app.current_tenant_id')` (and `app.current_user_id`,
  `app.current_admin_id` for the MFA tables).

The shared instance supplies one role. A role attribute (BYPASSRLS) cannot be
toggled per connection, so two pools cannot be served correctly by one role under
the current model. Postgres roles are also cluster-global, so the hardcoded names
`app` / `app_admin` would collide with the other three apps.

### Target model
- A single role (the supplied DB user) owns the database and all objects.
- Every RLS table gets `force row level security` so the owning role is still
  subject to its policies.
- Every isolation policy gains a platform-mode bypass branch:

  ```sql
  using (
    current_setting('app.platform_mode', true) = 'on'
    or <existing predicate>
  )
  with check (
    current_setting('app.platform_mode', true) = 'on'
    or <existing predicate>
  )
  ```

  `<existing predicate>` is unchanged per table:
  - `users`, grosir tables → `tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid`
  - `user_mfa` → `user_id = nullif(current_setting('app.current_user_id', true), '')::uuid`
  - `platform_admin_mfa` → `admin_id = nullif(current_setting('app.current_admin_id', true), '')::uuid`

- `pool.ts`: both pools use `DATABASE_URL`. `adminPool` is constructed with
  `options: "-c app.platform_mode=on"`, so every admin connection starts in
  platform mode at the Postgres startup-parameter level (before any query runs).
  `tenantPool` omits the option, so RLS is enforced.
- `withTenant` / `withAdmin` in `withTenant.ts` keep their current signatures and
  behavior; only the pool definitions change underneath them. Direct
  `adminPool.query(...)` calls keep working because platform mode is a
  connection-level default.

### Migrations
Migrations have not yet run on the shared instance (fresh database), so the
existing files are edited in place rather than adding a new migration.

- `002_users_rls.sql`: remove the `do $$ ... create role ...` bootstrap block;
  remove `grant all ... to app_admin`, `alter default privileges ... to app_admin`,
  and `grant ... to app`. Add platform-mode branch to the `users` policy and
  `force row level security` on `users`.
- `003_grosir.sql`: remove the `grant ... to app` in the table loop; add the
  platform-mode branch to the policy template and `force row level security` in
  the loop.
- `004_auth_hardening.sql`: remove `grant ... to app` / `grant all ... to app_admin`
  on `user_mfa`, `platform_admin_mfa`, `refresh_token_blacklist`; add platform-mode
  branch + `force row level security` to `user_mfa` and `platform_admin_mfa`.
- `005_signup_tokens.sql`: remove `grant ... to app` / `grant all ... to app_admin`.
- `006_billing.sql`: remove `grant select on plans to app`.
- `migrate.ts`: read `DATABASE_URL` (drop `DATABASE_ADMIN_URL`); connect with
  `options: "-c app.platform_mode=on"` so data-touching migrations are unaffected
  by RLS.
- `db/seeds/seed-admin.ts`, `db/seeds/seed-plans.ts`: read `DATABASE_URL` with the
  same platform-mode option (`seed-admin` writes the RLS-protected `users` table).
- Delete `db/init/` (the container-init role script is no longer used).

### Security trade-off
Single-role + GUC isolation is weaker than a BYPASSRLS-role split: if tenant-path
code is ever routed through `adminPool` or sets `app.platform_mode` itself,
isolation breaks. Mitigation: `platform_mode` is set only via the `adminPool`
connection option, never via `SET` in application code; tenant code uses
`tenantPool` / `withTenant` exclusively. This invariant is enforced by review and
by the RLS isolation tests.

## 2. Redis — keyPrefix namespacing

Redis DB 0 is shared; the ACL for the supplied user restricts keys to
`<namespace>:*`. Raw keys today (`refresh:`, `mfa:`, `rl:`, `sub:plan:`) are
unprefixed; BullMQ keys use `BULLMQ_QUEUE_PREFIX`.

- New env var `APP_NAMESPACE` (replaces `BULLMQ_QUEUE_PREFIX`) holds the per-app
  namespace value (e.g. `postyb`).
- `lib/redis.ts`:
  - Main `redis` client gains `keyPrefix: \`${APP_NAMESPACE}:\``. This namespaces
    every command from `refreshStore`, `mfa.service`, `auth.service`,
    `quota.service`, and `rateLimit` middleware (ioredis applies `keyPrefix` to
    `eval`/`evalsha` KEYS as well).
  - Add a separate exported `bullConnection` client built **without** `keyPrefix`
    (BullMQ does not support ioredis `keyPrefix`).
- `queue/queues.ts` and `worker.ts`: use `bullConnection` for the BullMQ
  `connection`, and set `prefix: APP_NAMESPACE` so BullMQ keys also land under
  `<namespace>:`.
- `REDIS_URL` now carries credentials (`redis://user:pw@redis:6379/0`); ioredis
  parses auth from the URL — no code change needed for auth.

## 3. MinIO — backup target

MinIO is S3-compatible and used only by `infra/backup/*.sh`. The supplied env vars
are `MINIO_*`, while the scripts read `BACKUP_S3_*`.

- `infra/backup/backup.sh`, `restore.sh`, `test-backup-scripts.sh`: read
  `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET`,
  falling back to the legacy `BACKUP_S3_*` names when unset.
- `MINIO_ENDPOINT` has no scheme (`minio:9000`); the scripts prepend `http://`
  when no scheme is present before passing it to `aws --endpoint-url`.
- The bucket (`MINIO_BUCKET`) is already app-specific. Backup object names change
  from `brosolution-db-*` to `${APP_NAMESPACE}-db-*`; the retention-prune regex in
  `backup.sh` is updated to match.
- `BACKUP_RETENTION_DAYS` is kept. Report exports stay on the local `exports`
  volume — unchanged.

## 4. docker-compose

All environments connect to the shared instance.

- Remove the `db` and `redis` services from `docker-compose.yml`,
  `docker-compose.prod.yml`, and `docker-compose.staging.yml`, along with their
  volumes (`db-data`, `redis-data`, `db-staging-data`, `redis-staging-data`) and
  the `./db/init` bind mount.
- Remove `depends_on: db / redis` from the `api` and `worker` services.
- Add an external network and attach `api`, `worker`, `web`:

  ```yaml
  networks:
    shared:
      external: true
      name: ${SHARED_NETWORK}
  ```

  so the `postgres` / `redis` / `minio` hostnames resolve.
- `mailhog` (dev profile) and the `exports` volume are kept.
- Pass `APP_NAMESPACE` through the shared `x-app-environment` / `x-api-environment`
  anchors (replacing `BULLMQ_QUEUE_PREFIX`).

## 5. Environment files

`.env`, `.env.example`, `.env.staging.example`:

- **Postgres:** remove `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` /
  `POSTGRES_APP_USER` / `POSTGRES_APP_PASSWORD` / `POSTGRES_ADMIN_USER` /
  `POSTGRES_ADMIN_PASSWORD` and `DATABASE_ADMIN_URL`. Keep a single
  `DATABASE_URL=postgresql://<user>:<pw>@postgres:5432/<db>`.
- **Redis:** `REDIS_URL=redis://<user>:<pw>@redis:6379/0`; add `APP_NAMESPACE`;
  remove `BULLMQ_QUEUE_PREFIX`.
- **MinIO:** add `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` /
  `MINIO_BUCKET`; replace the `BACKUP_S3_*` block (keep `BACKUP_RETENTION_DAYS`).
- Add `SHARED_NETWORK`.
- `.env.example` / `.env.staging.example` use placeholders; the real `.env` is
  filled when credentials are delivered.

## 6. Tests and docs

- RLS-related tests assume the two-role / BYPASSRLS model and must be updated to
  the `platform_mode` model: `src/db/rls-isolation.test.ts`,
  `src/db/user-scoped-rls.test.ts`, `src/db/withTenant.context.test.ts`,
  `src/db/pool.test.ts`, and the `*-migration.test.ts` files that assert grants to
  `app` / `app_admin`.
- Update `docs/env-reference.md`, `README.md`, and `docs/runbook.md` to describe
  the shared-instance env vars and the removal of the bundled containers.

## Out of scope

- Moving report exports to MinIO (would require an S3 client — a feature, not
  config prep).
- Provisioning the shared instance itself (database, role, bucket, ACL, network)
  — done by the instance owner.

## Verification

- `pnpm -r test` passes (API + packages), including the updated RLS tests.
- `docker compose config` resolves for dev, staging, and prod with no `db` /
  `redis` services and the `shared` external network present.
- `migrate.ts` applies cleanly against a database owned by a single role.
- A tenant query through `tenantPool` cannot read another tenant's rows; a
  platform query through `adminPool` can.
