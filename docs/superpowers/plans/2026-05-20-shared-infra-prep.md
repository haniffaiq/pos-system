# Shared-Infra Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo connect to an externally-provisioned shared PostgreSQL / Redis / MinIO instance (shared with three other apps) using credentials in `.env`, with no cross-app collision.

**Architecture:** Postgres drops its two-role (NOBYPASSRLS/BYPASSRLS) model for a single role plus an `app.platform_mode` session GUC; RLS tables are forced and policies gain a platform-mode bypass. Redis isolates via an ioredis `keyPrefix` (BullMQ uses a separate non-prefixed connection). MinIO is the backup target. All bundled `db`/`redis` containers are removed; app containers join an external Docker network.

**Tech Stack:** PostgreSQL 16 + RLS, `pg`, ioredis, BullMQ, Hono, docker-compose, bash backup scripts.

**Spec:** `docs/superpowers/specs/2026-05-20-shared-infra-prep-design.md`

---

## Task 1: Postgres migrations — single-role + platform-mode

Migrations have not run on the shared instance, so existing files are edited in place. The migration source-contract tests (`*-migration.test.ts`) assert SQL string content and are updated first (TDD).

**Files:**
- Modify: `db/migrations/002_users_rls.sql`
- Modify: `db/migrations/003_grosir.sql`
- Modify: `db/migrations/004_auth_hardening.sql`
- Modify: `db/migrations/005_signup_tokens.sql`
- Modify: `db/migrations/006_billing.sql`
- Test: `apps/api/src/db/users-migration.test.ts`
- Test: `apps/api/src/db/grosir-migration.test.ts`
- Test: `apps/api/src/db/auth-hardening-migration.test.ts`
- Test: `apps/api/src/db/signup-tokens-migration.test.ts`
- Test: `apps/api/src/db/billing-migration.test.ts`

- [ ] **Step 1: Update `users-migration.test.ts`**

Replace the first `it(...)` block entirely:

```typescript
  it("does not provision cluster-global roles (shared instance owner does that)", () => {
    const migration = sql();

    expect(migration).not.toContain("create role");
    expect(migration).not.toContain("app_admin");
  });
```

In the `"enables RLS and protects reads and writes with the tenant context"` block, replace the policy/grant assertions with:

```typescript
    expect(migration).toContain("alter table users enable row level security");
    expect(migration).toContain("alter table users force row level security");
    expect(migration).toContain("create policy users_tenant_isolation on users");
    expect(migration).toContain("current_setting('app.platform_mode', true) = 'on'");
    expect(migration).toContain("or tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid");
    expect(migration).not.toContain("to app");
```

- [ ] **Step 2: Update `grosir-migration.test.ts`**

In the `"applies tenant RLS with matching read and write policies"` block, replace the assertion body with:

```typescript
    expect(migration).toContain("create or replace function apply_tenant_rls(tbl regclass) returns void");
    expect(migration).toContain("alter table %s enable row level security");
    expect(migration).toContain("alter table %s force row level security");
    expect(migration).toContain("current_setting(''app.platform_mode'', true) = ''on''");
    expect(migration).toContain("tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid");
    expect(migration).not.toContain("to app");
    for (const table of TABLES) {
      expect(migration).toContain(`select apply_tenant_rls('${table}')`);
    }
```

- [ ] **Step 3: Update `auth-hardening-migration.test.ts`**

Replace the `"enables self-scoped RLS and grants app access for MFA tables"` block with:

```typescript
  it("enables forced self-scoped RLS for MFA tables without role grants", () => {
    const migration = sql();

    expect(migration).toContain("alter table user_mfa enable row level security");
    expect(migration).toContain("alter table user_mfa force row level security");
    expect(migration).toContain("create policy user_mfa_self on user_mfa");
    expect(migration).toContain("user_id = nullif(current_setting('app.current_user_id', true), '')::uuid");
    expect(migration).toContain("alter table platform_admin_mfa enable row level security");
    expect(migration).toContain("alter table platform_admin_mfa force row level security");
    expect(migration).toContain("create policy platform_admin_mfa_self on platform_admin_mfa");
    expect(migration).toContain("admin_id = nullif(current_setting('app.current_admin_id', true), '')::uuid");
    expect(migration).toContain("current_setting('app.platform_mode', true) = 'on'");
    expect(migration).not.toContain("to app");
  });
```

- [ ] **Step 4: Update `signup-tokens-migration.test.ts`**

Replace the `"grants app access without tenant RLS because signup runs before authentication"` block with:

```typescript
  it("has no role grants and no tenant RLS because signup runs before authentication", () => {
    const migration = sql();

    expect(migration).not.toContain("to app");
    expect(migration).not.toContain("enable row level security");
  });
```

- [ ] **Step 5: Update `billing-migration.test.ts`**

In the `"protects tenant-owned billing tables with RLS and grants plan reads"` block, replace `expect(migration).toContain("grant select on plans to app");` with:

```typescript
    expect(migration).not.toContain("to app");
```

- [ ] **Step 6: Run the migration tests to verify they fail**

Run: `pnpm --filter @app/api test -- --run src/db/users-migration.test.ts src/db/grosir-migration.test.ts src/db/auth-hardening-migration.test.ts src/db/signup-tokens-migration.test.ts src/db/billing-migration.test.ts`
Expected: FAIL — migrations still contain `to app` / role-creation SQL.

- [ ] **Step 7: Rewrite `db/migrations/002_users_rls.sql`**

Replace the entire file with:

```sql
-- Tenant-scoped users table protected by RLS. The shared-instance owner
-- provisions the database, role, and object ownership; this migration defines
-- only schema and policy. Platform queries bypass RLS via the app.platform_mode
-- session GUC (set as a connection option on the admin pool).
create table users (
  id            uuid primary key default uuid_v7(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  email         text not null,
  password_hash text not null,
  name          text not null,
  role          text not null check (role in ('owner','manager','cashier')),
  status        text not null default 'active' check (status in ('active','suspended')),
  created_at    timestamptz not null default now(),
  unique (tenant_id, email)
);

alter table users enable row level security;
alter table users force row level security;

create policy users_tenant_isolation on users
  using (
    current_setting('app.platform_mode', true) = 'on'
    or tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  with check (
    current_setting('app.platform_mode', true) = 'on'
    or tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );
```

- [ ] **Step 8: Update the `apply_tenant_rls` function in `db/migrations/003_grosir.sql`**

Replace the `create or replace function apply_tenant_rls(...) ... language plpgsql;` block (near the top of the file) with:

```sql
create or replace function apply_tenant_rls(tbl regclass) returns void as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('alter table %s force row level security', tbl);
  execute format(
    'create policy tenant_isolation on %s
       using (current_setting(''app.platform_mode'', true) = ''on''
              or tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)
       with check (current_setting(''app.platform_mode'', true) = ''on''
              or tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)', tbl);
end $$ language plpgsql;
```

Leave the rest of `003_grosir.sql` unchanged.

- [ ] **Step 9: Update `db/migrations/004_auth_hardening.sql`**

For `user_mfa`: replace `alter table user_mfa enable row level security;` with:

```sql
alter table user_mfa enable row level security;
alter table user_mfa force row level security;
```

Replace the `create policy user_mfa_self ...` block with:

```sql
create policy user_mfa_self on user_mfa
  using (
    current_setting('app.platform_mode', true) = 'on'
    or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  )
  with check (
    current_setting('app.platform_mode', true) = 'on'
    or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );
```

Delete both lines: `grant select, insert, update, delete on user_mfa to app;` and `grant all on user_mfa to app_admin;`.

For `platform_admin_mfa`: replace `alter table platform_admin_mfa enable row level security;` with:

```sql
alter table platform_admin_mfa enable row level security;
alter table platform_admin_mfa force row level security;
```

Replace the `create policy platform_admin_mfa_self ...` block with:

```sql
create policy platform_admin_mfa_self on platform_admin_mfa
  using (
    current_setting('app.platform_mode', true) = 'on'
    or admin_id = nullif(current_setting('app.current_admin_id', true), '')::uuid
  )
  with check (
    current_setting('app.platform_mode', true) = 'on'
    or admin_id = nullif(current_setting('app.current_admin_id', true), '')::uuid
  );
```

Delete both lines: `grant select, insert, update, delete on platform_admin_mfa to app;` and `grant all on platform_admin_mfa to app_admin;`.

For `refresh_token_blacklist`: delete both lines `grant select, insert, update, delete on refresh_token_blacklist to app;` and `grant all on refresh_token_blacklist to app_admin;`.

- [ ] **Step 10: Update `db/migrations/005_signup_tokens.sql`**

Delete both lines: `grant select, insert, update, delete on signup_tokens to app;` and `grant all on signup_tokens to app_admin;`.

- [ ] **Step 11: Update `db/migrations/006_billing.sql`**

Delete the line `grant select on plans to app;`.

- [ ] **Step 12: Run the migration tests to verify they pass**

Run: `pnpm --filter @app/api test -- --run src/db/users-migration.test.ts src/db/grosir-migration.test.ts src/db/auth-hardening-migration.test.ts src/db/signup-tokens-migration.test.ts src/db/billing-migration.test.ts src/db/platform-migration.test.ts`
Expected: PASS (all six files).

- [ ] **Step 13: Commit**

```bash
git add db/migrations apps/api/src/db/*-migration.test.ts
git commit -m "refactor(db): single-role RLS with platform-mode bypass"
```

---

## Task 2: Postgres pools, migrate runner, seeds

**Files:**
- Modify: `apps/api/src/db/pool.ts`
- Modify: `db/migrate.ts`
- Modify: `db/seeds/seed-admin.ts`
- Modify: `db/seeds/seed-plans.ts`
- Delete: `db/init/001-create-app-admin.sh` (and the empty `db/init/` directory)

- [ ] **Step 1: Rewrite `apps/api/src/db/pool.ts`**

```typescript
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

/** Pool for tenant-facing requests — RLS enforced. */
export const tenantPool = new Pool({ connectionString });

/**
 * Pool for platform-admin requests. Connections start with the
 * app.platform_mode GUC set to 'on' (a Postgres startup option), so RLS
 * policies allow cross-tenant access. This is the only place platform mode is
 * set — tenant code never enables it.
 */
export const adminPool = new Pool({
  connectionString,
  options: "-c app.platform_mode=on",
});
```

- [ ] **Step 2: Update `db/migrate.ts`**

Replace the pool construction line:

```typescript
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

with:

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c app.platform_mode=on",
});
```

- [ ] **Step 3: Update `db/seeds/seed-admin.ts`**

Change the env guard and pool construction. Replace:

```typescript
  if (!process.env.DATABASE_ADMIN_URL) {
    console.error("DATABASE_ADMIN_URL is required to seed a platform admin");
```

with:

```typescript
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to seed a platform admin");
```

(keep the surrounding lines, e.g. the `process.exit` that follows). Replace:

```typescript
  const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
```

with:

```typescript
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c app.platform_mode=on",
  });
```

- [ ] **Step 4: Update `db/seeds/seed-plans.ts`**

Apply the same two replacements as Step 3 (the `DATABASE_ADMIN_URL` guard message says "to seed billing plans" — keep that wording, only swap the env var name), and the pool construction with the `options` field.

- [ ] **Step 5: Delete the container-init script**

```bash
git rm db/init/001-create-app-admin.sh
```

- [ ] **Step 6: Type-check the API package**

Run: `pnpm --filter @app/api exec tsc -p tsconfig.json --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 7: Run the full API test suite**

Run: `pnpm --filter @app/api test`
Expected: PASS — DB-integration tests skip (no `DATABASE_URL` set locally); migration-source and unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db/pool.ts db/migrate.ts db/seeds/seed-admin.ts db/seeds/seed-plans.ts db/init
git commit -m "refactor(db): single DATABASE_URL with platform-mode admin pool"
```

---

## Task 3: DB-integration test gating

These tests gate on `DATABASE_URL && DATABASE_ADMIN_URL`. `DATABASE_ADMIN_URL` no longer exists; gate on `DATABASE_URL` only. Test logic is unchanged — `adminPool` still bypasses RLS, now via platform mode.

**Files:**
- Test: `apps/api/src/db/pool.test.ts`
- Test: `apps/api/src/db/rls-isolation.test.ts`
- Test: `apps/api/src/db/withTenant.test.ts`
- Test: `apps/api/src/db/user-scoped-rls.test.ts`
- Test: `apps/api/src/db/withTenant.context.test.ts`

- [ ] **Step 1: Update each of the five files**

In each file, delete the line:

```typescript
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;
```

and change:

```typescript
const describeWithDatabase = databaseUrl && databaseAdminUrl ? describe : describe.skip;
```

to:

```typescript
const describeWithDatabase = databaseUrl ? describe : describe.skip;
```

- [ ] **Step 2: Update `pool.test.ts` assertion wording**

In `pool.test.ts`, the second test is named `"connects with the admin role"`. Rename it to `"connects through the admin pool in platform mode"` and add an assertion that platform mode is active:

```typescript
  it("connects through the admin pool in platform mode", async () => {
    const { rows } = await adminPool.query<{ mode: string | null }>(
      "select current_setting('app.platform_mode', true) as mode",
    );

    expect(rows[0]?.mode).toBe("on");
  });
```

- [ ] **Step 3: Verify the suite still passes without a database**

Run: `pnpm --filter @app/api test -- --run src/db/pool.test.ts src/db/rls-isolation.test.ts src/db/withTenant.test.ts src/db/user-scoped-rls.test.ts src/db/withTenant.context.test.ts`
Expected: PASS — all five describe blocks skip cleanly (no `DATABASE_URL`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/pool.test.ts apps/api/src/db/rls-isolation.test.ts apps/api/src/db/withTenant.test.ts apps/api/src/db/user-scoped-rls.test.ts apps/api/src/db/withTenant.context.test.ts
git commit -m "test(db): gate integration tests on DATABASE_URL only"
```

---

## Task 4: Redis namespacing

Redis DB 0 is shared and the ACL restricts keys to `<APP_NAMESPACE>:*`. The main ioredis client gets a `keyPrefix`; BullMQ needs a separate connection without `keyPrefix` (it does not support it) plus the `prefix` option.

**Files:**
- Modify: `apps/api/src/lib/redis.ts`
- Modify: `apps/api/src/queue/queues.ts`
- Modify: `apps/api/src/worker.ts`

- [ ] **Step 1: Rewrite `apps/api/src/lib/redis.ts`**

```typescript
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl && process.env.NODE_ENV !== "test") {
  throw new Error("REDIS_URL is required outside test runs");
}

/** Per-app namespace for the shared Redis instance (ACL-enforced key prefix). */
export const appNamespace = process.env.APP_NAMESPACE ?? "app";

/**
 * Main Redis client. keyPrefix namespaces every command (refresh tokens, MFA,
 * rate limiting, plan cache) under `<namespace>:` so keys cannot collide with
 * the other apps on the shared instance.
 */
export const redis = new Redis(redisUrl ?? "redis://localhost:6379", {
  lazyConnect: !redisUrl && process.env.NODE_ENV === "test",
  maxRetriesPerRequest: null,
  keyPrefix: `${appNamespace}:`,
});

/**
 * Dedicated connection for BullMQ. BullMQ does not support ioredis keyPrefix;
 * it namespaces via its own `prefix` option instead (see queues.ts / worker.ts).
 */
export const bullConnection = new Redis(redisUrl ?? "redis://localhost:6379", {
  lazyConnect: !redisUrl && process.env.NODE_ENV === "test",
  maxRetriesPerRequest: null,
});
```

- [ ] **Step 2: Update `apps/api/src/queue/queues.ts`**

Change the import:

```typescript
import { bullConnection, appNamespace } from "../lib/redis";
```

Change the `queueOptions` object:

```typescript
const queueOptions = {
  connection: bullConnection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
  prefix: appNamespace,
};
```

- [ ] **Step 3: Update `apps/api/src/worker.ts`**

Change the import on line 3 from `import { redis } from "./lib/redis";` to:

```typescript
import { bullConnection, appNamespace } from "./lib/redis";
```

Change the `workerOptions` object (lines ~30-32):

```typescript
const workerOptions: WorkerOptions = {
  connection: bullConnection,
  prefix: appNamespace,
};
```

If `worker.ts` references `redis` anywhere else (e.g. a shutdown/ping path), keep importing `redis` alongside `bullConnection` and leave those uses unchanged.

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @app/api exec tsc -p tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 5: Run the API test suite**

Run: `pnpm --filter @app/api test`
Expected: PASS — Redis-backed tests skip without `REDIS_URL`; the rest pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/redis.ts apps/api/src/queue/queues.ts apps/api/src/worker.ts
git commit -m "feat(redis): namespace keys with APP_NAMESPACE prefix"
```

---

## Task 5: MinIO backup scripts

The scripts read `BACKUP_S3_*`; the shared instance supplies `MINIO_*`. Make the scripts prefer `MINIO_*`, fall back to `BACKUP_S3_*`, and tolerate a scheme-less endpoint.

**Files:**
- Modify: `infra/backup/backup.sh`
- Modify: `infra/backup/restore.sh`
- Modify: `infra/backup/test-backup-scripts.sh`

- [ ] **Step 1: Read all three scripts**

Read `infra/backup/backup.sh`, `infra/backup/restore.sh`, and `infra/backup/test-backup-scripts.sh` in full to see every `BACKUP_S3_*` reference and how `test-backup-scripts.sh` invokes the others.

- [ ] **Step 2: Add a resolved-config preamble to `backup.sh`**

In `backup.sh`, immediately after the `s3_uri()` / helper definitions and before `main()`, add:

```bash
# Resolve MinIO/S3 config: prefer MINIO_* (shared instance), fall back to legacy BACKUP_S3_*.
S3_ENDPOINT="${MINIO_ENDPOINT:-${BACKUP_S3_ENDPOINT:-}}"
S3_BUCKET="${MINIO_BUCKET:-${BACKUP_S3_BUCKET:-}}"
S3_ACCESS_KEY="${MINIO_ACCESS_KEY:-${BACKUP_S3_ACCESS_KEY:-}}"
S3_SECRET_KEY="${MINIO_SECRET_KEY:-${BACKUP_S3_SECRET_KEY:-}}"
S3_REGION="${BACKUP_S3_REGION:-auto}"

# MINIO_ENDPOINT may be scheme-less (e.g. minio:9000); aws --endpoint-url needs a scheme.
if [[ -n "$S3_ENDPOINT" && "$S3_ENDPOINT" != http://* && "$S3_ENDPOINT" != https://* ]]; then
  S3_ENDPOINT="http://${S3_ENDPOINT}"
fi
```

- [ ] **Step 3: Switch `backup.sh` over to the resolved variables**

In `backup.sh`, replace every use of `BACKUP_S3_ENDPOINT` with `$S3_ENDPOINT`, `BACKUP_S3_BUCKET` with `$S3_BUCKET`, `BACKUP_S3_ACCESS_KEY` with `$S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY` with `$S3_SECRET_KEY`, and `BACKUP_S3_REGION` with `$S3_REGION`. Specifically:

- `s3_uri()`: use `${S3_BUCKET}` instead of `${BACKUP_S3_BUCKET}`.
- `main()` requires: replace `require_env BACKUP_S3_ENDPOINT` / `require_env BACKUP_S3_BUCKET` with checks on the resolved vars:

  ```bash
  [[ -n "$S3_ENDPOINT" ]] || { echo "missing required env: MINIO_ENDPOINT (or BACKUP_S3_ENDPOINT)" >&2; exit 64; }
  [[ -n "$S3_BUCKET" ]] || { echo "missing required env: MINIO_BUCKET (or BACKUP_S3_BUCKET)" >&2; exit 64; }
  ```

- The `export AWS_*` lines: `AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY:-${AWS_ACCESS_KEY_ID:-}}"`, `AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-${AWS_SECRET_ACCESS_KEY:-}}"`, `AWS_DEFAULT_REGION="${S3_REGION:-${AWS_DEFAULT_REGION:-auto}}"`.
- Every `aws --endpoint-url="$BACKUP_S3_ENDPOINT"` becomes `aws --endpoint-url="$S3_ENDPOINT"`.
- `prune_expired_backups`: keep `BACKUP_S3_PREFIX` as-is (still a valid optional var).

- [ ] **Step 4: Namespace the backup object name in `backup.sh`**

Change the object name so multiple apps never collide even in a shared bucket. Replace:

```bash
  local name="brosolution-db-${ts}.dump"
```

with:

```bash
  local name="${APP_NAMESPACE:-brosolution}-db-${ts}.dump"
```

In `prune_expired_backups`, update the regex from `brosolution-db-` to the namespace:

```bash
    local ns="${APP_NAMESPACE:-brosolution}"
    [[ "$key" =~ ^${ns}-db-([0-9]{8}T[0-9]{6}Z)\.dump(\.sha256)?$ ]] || continue
```

- [ ] **Step 5: Apply the same config resolution to `restore.sh`**

Add the same resolved-config preamble (Step 2) to `restore.sh`, and replace every `BACKUP_S3_*` reference and `aws --endpoint-url` argument with the resolved `$S3_*` variables, mirroring Step 3. If `restore.sh` hardcodes the `brosolution-db-` object prefix, apply the `${APP_NAMESPACE:-brosolution}` change from Step 4.

- [ ] **Step 6: Update `test-backup-scripts.sh`**

Update `test-backup-scripts.sh` so the env it sets for the harness uses `MINIO_*` names (`MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`) instead of `BACKUP_S3_*`. If it asserts on the object name `brosolution-db-`, set `APP_NAMESPACE` in the test env so the expected name matches, or update the expected prefix accordingly.

- [ ] **Step 7: Run the backup script test**

Run: `bash infra/backup/test-backup-scripts.sh`
Expected: PASS (exit 0). If the test needs `aws`/`pg_dump` and they are unavailable in the environment, note that in the task report instead of marking it failed.

- [ ] **Step 8: Commit**

```bash
git add infra/backup/backup.sh infra/backup/restore.sh infra/backup/test-backup-scripts.sh
git commit -m "feat(backup): target shared MinIO via MINIO_* env"
```

---

## Task 6: docker-compose — remove bundled db/redis, join shared network

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`
- Modify: `docker-compose.staging.yml`

- [ ] **Step 1: Update `docker-compose.yml`**

- Delete the entire `db:` service block and the entire `redis:` service block.
- In the `api` and `worker` services, delete the whole `depends_on:` block (the `db`/`redis` conditions).
- In the `x-app-environment` anchor, replace `BULLMQ_QUEUE_PREFIX: ${BULLMQ_QUEUE_PREFIX}` if present, and add `APP_NAMESPACE: ${APP_NAMESPACE}`. (If `BULLMQ_QUEUE_PREFIX` is not in the anchor, just add `APP_NAMESPACE`.)
- Add a top-level `networks:` block and attach the `api`, `worker`, and `web` services to it:

  ```yaml
  networks:
    shared:
      external: true
      name: ${SHARED_NETWORK}
  ```

  For each of `api`, `worker`, `web`, add:

  ```yaml
    networks:
      - default
      - shared
  ```

- Leave the `mailhog` service, the `exports` volume, and the `volumes:` block (now containing only `exports`) intact.

- [ ] **Step 2: Update `docker-compose.prod.yml`**

- Delete the `db:` and `redis:` service blocks.
- Delete the `depends_on:` blocks from `api` and `worker`.
- In `volumes:`, delete `db-data` and `redis-data` (keep `caddy-data`, `caddy-config`, `exports`).
- In the `x-api-environment` anchor, replace `BULLMQ_QUEUE_PREFIX: ${BULLMQ_QUEUE_PREFIX:-prod}` with `APP_NAMESPACE: ${APP_NAMESPACE}`.
- Add the same top-level `networks:` block as Step 1 and attach `api`, `worker`, `web` to `default` + `shared`.

- [ ] **Step 3: Update `docker-compose.staging.yml`**

- Delete the `db:` and `redis:` service override blocks.
- In `volumes:`, delete `db-staging-data` and `redis-staging-data` (keep `caddy-staging-data`, `caddy-staging-config`, `exports-staging`).
- In the `api` and `worker` `environment:` blocks, replace `BULLMQ_QUEUE_PREFIX: ${BULLMQ_QUEUE_PREFIX:-staging}` with `APP_NAMESPACE: ${APP_NAMESPACE}`.

- [ ] **Step 4: Validate every compose file**

Run, with a throwaway env so interpolation resolves:

```bash
SHARED_NETWORK=shared-infra APP_NAMESPACE=app docker compose -f docker-compose.yml config >/dev/null && echo "dev ok"
SHARED_NETWORK=shared-infra APP_NAMESPACE=app docker compose -f docker-compose.yml -f docker-compose.prod.yml config >/dev/null && echo "prod ok"
SHARED_NETWORK=shared-infra APP_NAMESPACE=app docker compose -f docker-compose.yml -f docker-compose.staging.yml config >/dev/null && echo "staging ok"
```

Expected: `dev ok`, `prod ok`, `staging ok`, with no `db`/`redis` services and no unresolved-variable warnings. (If prod/staging are normally run standalone rather than layered on the base file, validate them standalone instead — match the existing runbook usage.)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker-compose.prod.yml docker-compose.staging.yml
git commit -m "chore(compose): use shared db/redis, drop bundled containers"
```

---

## Task 7: Environment files

**Files:**
- Modify: `.env.example`
- Modify: `.env.staging.example`
- Modify: `.env`

- [ ] **Step 1: Update `.env.example`**

Replace the `# Postgres` block (the seven `POSTGRES_*` lines plus `DATABASE_URL` and `DATABASE_ADMIN_URL`) with:

```
# Postgres — shared instance (credentials supplied by the instance owner)
DATABASE_URL=postgresql://change_me_user:change_me_password@postgres:5432/change_me_db
```

In the `# Redis / queues / exports` block, replace `REDIS_URL=redis://redis:6379` with `REDIS_URL=redis://change_me_user:change_me_password@redis:6379/0`, and replace `BULLMQ_QUEUE_PREFIX=brosolution` with `APP_NAMESPACE=change_me_namespace`.

Replace the `# Backup target (P8)` block (the `BACKUP_S3_*` lines) with:

```
# MinIO — shared object storage, used as the database backup target
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=change_me_minio_access_key
MINIO_SECRET_KEY=change_me_minio_secret_key
MINIO_BUCKET=change_me_bucket
BACKUP_RETENTION_DAYS=30
```

At the end of the `# App` block, add:

```
# Shared Docker network (name supplied by the instance owner) so the
# postgres / redis / minio hostnames resolve.
SHARED_NETWORK=change_me_shared_network
```

- [ ] **Step 2: Update `.env.staging.example`**

Apply the same structural changes as Step 1 to `.env.staging.example`, keeping any staging-specific values. Remove `POSTGRES_*`, `DATABASE_ADMIN_URL`, `BULLMQ_QUEUE_PREFIX`, and `BACKUP_S3_*`; add `APP_NAMESPACE`, `MINIO_*`, and `SHARED_NETWORK`.

- [ ] **Step 3: Update `.env`**

Apply the same structural changes to `.env`. Since real shared-instance credentials are not yet delivered, use the example credential values from the spec as placeholders:

```
DATABASE_URL=postgresql://postyb:REPLACE_WITH_REAL_PASSWORD@postgres:5432/postyb
REDIS_URL=redis://postyb:REPLACE_WITH_REAL_PASSWORD@redis:6379/0
APP_NAMESPACE=postyb
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=postybkey
MINIO_SECRET_KEY=REPLACE_WITH_REAL_SECRET
MINIO_BUCKET=postyb
SHARED_NETWORK=REPLACE_WITH_REAL_NETWORK
```

Remove `POSTGRES_*`, `DATABASE_ADMIN_URL`, `BULLMQ_QUEUE_PREFIX`, and the `BACKUP_S3_*` lines. Keep `BACKUP_RETENTION_DAYS` and all other unrelated keys untouched. `.env` is gitignored — it is not committed.

- [ ] **Step 4: Verify gitignore still excludes `.env`**

Run: `git check-ignore .env && echo "ignored"`
Expected: prints `.env` then `ignored`.

- [ ] **Step 5: Commit**

```bash
git add .env.example .env.staging.example
git commit -m "chore(env): shared-instance env template (Postgres/Redis/MinIO)"
```

---

## Task 8: Documentation

**Files:**
- Modify: `docs/env-reference.md`
- Modify: `README.md`
- Modify: `docs/runbook.md`

- [ ] **Step 1: Update `docs/env-reference.md`**

Read the file. Remove rows/sections for `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_APP_USER`, `POSTGRES_APP_PASSWORD`, `POSTGRES_ADMIN_USER`, `POSTGRES_ADMIN_PASSWORD`, `DATABASE_ADMIN_URL`, `BULLMQ_QUEUE_PREFIX`, and `BACKUP_S3_*`. Add entries for: `DATABASE_URL` (single shared-instance connection string), `APP_NAMESPACE` (per-app Redis key prefix + BullMQ prefix + backup object prefix), `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET`, and `SHARED_NETWORK`. Note that `REDIS_URL` now carries credentials and a DB index.

- [ ] **Step 2: Update `README.md`**

Read the file. Update any setup/quickstart section that describes bundled `db`/`redis` containers or the `POSTGRES_*` / `DATABASE_ADMIN_URL` variables: the app now connects to an externally-provisioned shared instance, and `docker compose` no longer starts `db`/`redis`. Note that the shared Docker network named by `SHARED_NETWORK` must exist before `docker compose up`.

- [ ] **Step 3: Update `docs/runbook.md`**

Read the file. Update any commands or procedures that reference the bundled `db`/`redis` services, `DATABASE_ADMIN_URL`, `POSTGRES_*`, `BULLMQ_QUEUE_PREFIX`, or `BACKUP_S3_*`. The backup runbook should reference `MINIO_*`. Add a short note that the shared instance (database, single role + object ownership, Redis ACL for `<APP_NAMESPACE>:*`, MinIO bucket, and the `SHARED_NETWORK` Docker network) is provisioned by the instance owner.

- [ ] **Step 4: Commit**

```bash
git add docs/env-reference.md README.md docs/runbook.md
git commit -m "docs: shared-instance env and operations"
```

---

## Task 9: CI workflow and e2e seed scripts

`.github/workflows/ci.yml` and the `e2e/*.sh` seed scripts still reference the removed `DATABASE_ADMIN_URL` / two-role model. CI runs its own ephemeral Postgres (not the shared instance), but it must mirror the single-role + forced-RLS model so the RLS isolation tests are meaningful: the CI `DATABASE_URL` role must be a non-superuser that owns the database (superusers always bypass RLS, even FORCED).

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `e2e/seed-quota.sh`
- Modify: `e2e/seed-grosir.sh`

- [ ] **Step 1: Update `ci.yml` env block**

In the `verify` job `env:` block: delete the `DATABASE_ADMIN_URL:` line. Keep `DATABASE_URL: postgres://app:app_password@localhost:5432/operational`. Replace the `BULLMQ_QUEUE_PREFIX: ci-${{ github.run_id }}-${{ github.run_attempt }}` line with `APP_NAMESPACE: ci-${{ github.run_id }}-${{ github.run_attempt }}`.

- [ ] **Step 2: Simplify the "Prepare database roles" step in `ci.yml`**

Replace the heredoc SQL in the `Prepare database roles` step with a single-role version — one non-superuser `app` role that owns the database and schema:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN PASSWORD 'app_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
ALTER ROLE app WITH LOGIN PASSWORD 'app_password' NOSUPERUSER NOBYPASSRLS;
ALTER DATABASE operational OWNER TO app;
ALTER SCHEMA public OWNER TO app;
GRANT ALL PRIVILEGES ON DATABASE operational TO app;
GRANT ALL PRIVILEGES ON SCHEMA public TO app;
```

(`app` is non-superuser and non-bypassrls so FORCED RLS applies to it; it owns the schema so `pnpm migrate`, which connects as `app`, can run DDL.)

- [ ] **Step 3: Update `e2e/seed-quota.sh`**

Replace the env guard:

```bash
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required to seed quota e2e tenants" >&2
  exit 1
fi
```

The `psql` invocation inserts into RLS-protected tables (`tenants`, `users`, `units`, `subscriptions`, `products`, `usage_counters`), so it must run in platform mode. Change `psql "$DATABASE_ADMIN_URL" --set ON_ERROR_STOP=1 \` to:

```bash
PGOPTIONS='-c app.platform_mode=on' psql "$DATABASE_URL" --set ON_ERROR_STOP=1 \
```

- [ ] **Step 4: Update `e2e/seed-grosir.sh`**

Change line `if [ -n "${DATABASE_ADMIN_URL:-}" ]; then` to `if [ -n "${DATABASE_URL:-}" ]; then`.

- [ ] **Step 5: Validate**

Run: `git grep -n "DATABASE_ADMIN_URL\|BULLMQ_QUEUE_PREFIX" -- .github e2e`
Expected: no matches.

Run: `bash -n e2e/seed-quota.sh && bash -n e2e/seed-grosir.sh && echo "shell syntax ok"`
Expected: `shell syntax ok`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml e2e/seed-quota.sh e2e/seed-grosir.sh
git commit -m "ci: single-role Postgres setup and APP_NAMESPACE"
```

---

## Final verification

- [ ] **Step 1: Full test suite**

Run: `pnpm -r --filter './apps/*' --filter './packages/*' test`
Expected: PASS. DB- and Redis-backed integration tests skip locally (no `DATABASE_URL` / `REDIS_URL`); everything else passes.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @app/api exec tsc -p tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 3: Compose validation**

Run the three `docker compose ... config` commands from Task 6 Step 4.
Expected: all three print `ok`.

- [ ] **Step 4: Confirm no stale references remain**

Run: `git grep -nE "DATABASE_ADMIN_URL|BULLMQ_QUEUE_PREFIX|app_admin|BACKUP_S3_" -- ':!docs/superpowers/specs' ':!docs/superpowers/plans'`
Expected: no matches, except intentional `BACKUP_S3_*` fallbacks inside `infra/backup/*.sh` if kept for back-compat. Review each remaining hit and confirm it is intentional.
