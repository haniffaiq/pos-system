# Operational Web App — Phased Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-tenant operational platform — tenancy core (super-admin, tenant registration, auth, RLS) plus the grosir sembako vertical (inventory, pricing, POS, reports) — shipping a usable product.

**Architecture:** Monorepo (pnpm workspaces). Next.js frontend, Hono.js REST API, BullMQ worker sharing the API image, PostgreSQL with row-level security for tenant isolation, Redis for refresh tokens and the job queue. All services run as separate Docker Compose containers. DB access is raw SQL via the `pg` driver with numbered `.sql` migrations. Sectors plug in through a module registry.

**Tech Stack:** TypeScript, Next.js (App Router), Hono.js, `pg`, PostgreSQL 16, Redis 7, BullMQ, Tailwind CSS, Vitest, Playwright, Docker Compose.

**Source spec:** `docs/superpowers/specs/2026-05-14-operational-web-app-design.md`

---

## Scope note

This plan fully details **Phase 1 (multi-tenancy core)** and **Phase 2 (grosir vertical)** — both fully specified in the source spec. **Phases 3–7** (retail / fnb / jasa / apotek modules, platform extras) appear only as a roadmap at the end: the spec defers their detailed design until immediately before each phase starts, so task-level detail cannot be written yet. When a later phase begins, return to the brainstorming → writing-plans cycle for that phase and append its tasks here.

---

## File Structure

### Phase 1 — files created

```
package.json                          root, pnpm workspaces + scripts
pnpm-workspace.yaml                   workspace globs
tsconfig.base.json                    shared TS config
docker-compose.yml                    db, redis, api, worker, web, mailhog(dev)
.env.example                          all env vars documented
.dockerignore

db/migrations/001_platform.sql        platform_admins, tenants, platform_audit_log
db/migrations/002_users_rls.sql       users table, DB roles, RLS policies
db/seeds/dev_seed.sql                 one platform admin for local dev
db/migrate.ts                         raw-SQL migration runner

packages/shared/package.json
packages/shared/src/index.ts          re-exports
packages/shared/src/schemas/auth.ts   zod: login, register-tenant
packages/shared/src/schemas/tenant.ts zod: tenant shapes
packages/shared/src/types.ts          shared TS types (Role, Sector, JwtPayload…)

packages/ui/package.json
packages/ui/src/index.ts              re-exports
packages/ui/src/Button.tsx
packages/ui/src/Card.tsx
packages/ui/src/Badge.tsx
packages/ui/src/Chip.tsx
packages/ui/src/IconTile.tsx
packages/ui/src/LogoChip.tsx
packages/ui/src/Input.tsx
packages/ui/src/Select.tsx
packages/ui/src/Table.tsx
packages/ui/src/Modal.tsx
packages/ui/src/Toast.tsx
packages/ui/src/Navbar.tsx
packages/ui/src/tailwind-preset.ts    color tokens, fonts, brutal shadows

apps/api/package.json
apps/api/Dockerfile
apps/api/src/index.ts                 Hono app entrypoint (API process)
apps/api/src/worker.ts                BullMQ worker entrypoint
apps/api/src/db/pool.ts               pg Pool (tenant role + admin role)
apps/api/src/db/withTenant.ts         tx helper: SET LOCAL app.current_tenant_id
apps/api/src/lib/password.ts          argon2 hash/verify
apps/api/src/lib/jwt.ts               sign/verify access + refresh
apps/api/src/lib/redis.ts             ioredis client
apps/api/src/lib/refreshStore.ts      refresh token store in Redis
apps/api/src/lib/errors.ts            AppError + uniform error shape
apps/api/src/middleware/error.ts      Hono error handler
apps/api/src/middleware/auth.ts       JWT verify, attach ctx, set RLS for tenant routes
apps/api/src/middleware/requireRole.ts role guard
apps/api/src/queue/queues.ts          BullMQ queue definitions
apps/api/src/queue/jobs/provisioning.ts
apps/api/src/queue/jobs/email.ts
apps/api/src/modules/registry.ts      sector → module map
apps/api/src/services/auth.service.ts
apps/api/src/services/tenant.service.ts
apps/api/src/routes/auth.routes.ts
apps/api/src/routes/admin.routes.ts   platform admin endpoints
apps/api/src/routes/tenant.routes.ts  /t/:tenantId router, mounts modules via registry

apps/web/package.json
apps/web/Dockerfile
apps/web/next.config.js
apps/web/tailwind.config.ts           consumes packages/ui preset
apps/web/src/app/layout.tsx
apps/web/src/app/(auth)/admin/login/page.tsx
apps/web/src/app/(auth)/t/[slug]/login/page.tsx
apps/web/src/app/admin/layout.tsx     super-admin shell
apps/web/src/app/admin/page.tsx       platform dashboard
apps/web/src/app/admin/tenants/page.tsx
apps/web/src/app/admin/tenants/new/page.tsx
apps/web/src/app/admin/tenants/[id]/page.tsx
apps/web/src/app/t/[slug]/layout.tsx  tenant shell
apps/web/src/app/t/[slug]/page.tsx    tenant dashboard / "coming soon"
apps/web/src/lib/api.ts               fetch wrapper with JWT
apps/web/src/lib/auth.ts              token storage, session helpers
```

### Phase 2 — files created

```
db/migrations/003_grosir.sql          categories, units, products, suppliers,
                                      stock_in(_items), sales(_items),
                                      stock_adjustments, stock_movements,
                                      notifications, export_jobs

apps/api/src/modules/grosir/index.ts          module definition (registry entry)
apps/api/src/modules/grosir/routes.ts         mounts all grosir sub-routers
apps/api/src/modules/grosir/masterdata.service.ts
apps/api/src/modules/grosir/masterdata.routes.ts
apps/api/src/modules/grosir/products.service.ts
apps/api/src/modules/grosir/products.routes.ts
apps/api/src/modules/grosir/stock.ts          recordMovement() tx helper
apps/api/src/modules/grosir/stockin.service.ts
apps/api/src/modules/grosir/stockin.routes.ts
apps/api/src/modules/grosir/sales.service.ts
apps/api/src/modules/grosir/sales.routes.ts
apps/api/src/modules/grosir/adjustments.service.ts
apps/api/src/modules/grosir/adjustments.routes.ts
apps/api/src/modules/grosir/dashboard.service.ts
apps/api/src/modules/grosir/dashboard.routes.ts
apps/api/src/modules/grosir/reports.service.ts
apps/api/src/modules/grosir/reports.routes.ts
apps/api/src/modules/grosir/notifications.service.ts
apps/api/src/modules/grosir/notifications.routes.ts
apps/api/src/queue/jobs/lowStockScan.ts
apps/api/src/queue/jobs/exportGeneration.ts

packages/shared/src/schemas/grosir.ts         zod: product, sale, stock-in, etc.

apps/web/src/app/t/[slug]/(grosir)/products/page.tsx
apps/web/src/app/t/[slug]/(grosir)/masterdata/page.tsx
apps/web/src/app/t/[slug]/(grosir)/stock-in/page.tsx
apps/web/src/app/t/[slug]/(grosir)/pos/page.tsx
apps/web/src/app/t/[slug]/(grosir)/adjustments/page.tsx
apps/web/src/app/t/[slug]/(grosir)/reports/page.tsx
apps/web/src/app/t/[slug]/(grosir)/notifications/page.tsx
```

---

## Phase 0 — Foundation

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.dockerignore`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "operational-web-app",
  "private": true,
  "scripts": {
    "dev": "docker compose --profile dev up --build",
    "migrate": "tsx db/migrate.ts",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0"
  },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  }
}
```

- [ ] **Step 4: Create `.dockerignore`**

```
node_modules
**/node_modules
**/dist
**/.next
.git
```

- [ ] **Step 5: Install and verify**

Run: `pnpm install`
Expected: completes, creates `pnpm-lock.yaml`, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .dockerignore pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo"
```

### Task 2: Docker Compose stack

**Files:**
- Create: `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Create `.env.example`**

```
# Postgres
POSTGRES_DB=operational
POSTGRES_USER=app
POSTGRES_PASSWORD=app_dev_pw
DATABASE_URL=postgres://app:app_dev_pw@db:5432/operational
DATABASE_ADMIN_URL=postgres://app_admin:admin_dev_pw@db:5432/operational

# Redis
REDIS_URL=redis://redis:6379

# Auth
JWT_ACCESS_SECRET=change_me_access
JWT_REFRESH_SECRET=change_me_refresh
ACCESS_TOKEN_TTL=900
REFRESH_TOKEN_TTL=1209600

# SMTP (dev = mailhog)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_FROM=no-reply@operational.app

# App
API_PORT=4000
WEB_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:4000
EXPORT_DIR=/data/exports
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports: ["5432:5432"]
    volumes:
      - ./db/data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    command: node dist/index.js
    env_file: .env
    ports: ["${API_PORT}:4000"]
    volumes:
      - exports:/data/exports
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_healthy }

  worker:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    command: node dist/worker.js
    env_file: .env
    volumes:
      - exports:/data/exports
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_healthy }

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    env_file: .env
    ports: ["${WEB_PORT}:3000"]
    depends_on: [api]

  mailhog:
    image: mailhog/mailhog
    profiles: ["dev"]
    ports: ["8025:8025"]

volumes:
  exports:
```

- [ ] **Step 3: Verify compose config parses**

Run: `cp .env.example .env && docker compose config`
Expected: prints resolved config, no errors. (Build will fail until Dockerfiles exist — that is fine here.)

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add docker compose stack"
```

### Task 3: Postgres pool + migration runner

**Files:**
- Create: `apps/api/package.json`, `apps/api/src/db/pool.ts`, `db/migrate.ts`
- Test: `apps/api/src/db/pool.test.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@app/api",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "pg": "^8.13.0",
    "ioredis": "^5.4.0",
    "bullmq": "^5.21.0",
    "argon2": "^0.41.0",
    "jose": "^5.9.0",
    "nodemailer": "^6.9.0",
    "zod": "^3.23.0",
    "@app/shared": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "@types/pg": "^8.11.0",
    "@types/nodemailer": "^6.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/db/pool.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tenantPool, adminPool } from "./pool";

describe("db pools", () => {
  it("connects with the tenant role and runs a query", async () => {
    const { rows } = await tenantPool.query("select 1 as ok");
    expect(rows[0].ok).toBe(1);
  });

  it("connects with the admin role", async () => {
    const { rows } = await adminPool.query("select 1 as ok");
    expect(rows[0].ok).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @app/api test pool`
Expected: FAIL — cannot find module `./pool`.

- [ ] **Step 4: Create `apps/api/src/db/pool.ts`**

```ts
import { Pool } from "pg";

/** Pool for tenant-facing requests — subject to RLS. */
export const tenantPool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Pool for platform-admin requests — connects as a BYPASSRLS role. */
export const adminPool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
```

- [ ] **Step 5: Create `db/migrate.ts`**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const dir = join(import.meta.dirname, "migrations");
const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });

async function run() {
  await pool.query(
    `create table if not exists _migrations (
       name text primary key, applied_at timestamptz not null default now())`
  );
  const applied = new Set(
    (await pool.query("select name from _migrations")).rows.map((r) => r.name)
  );
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into _migrations(name) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose up -d db && cp .env.example .env` then `pnpm --filter @app/api test pool`
Expected: PASS (after Task 5–6 migrations create the roles; if run before, the admin-role test fails — acceptable until Task 6, re-run then).

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/src/db/pool.ts apps/api/src/db/pool.test.ts db/migrate.ts pnpm-lock.yaml
git commit -m "feat: add pg pools and raw-sql migration runner"
```

### Task 4: Shared package (types + zod schemas)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`, `packages/shared/src/types.ts`, `packages/shared/src/schemas/auth.ts`, `packages/shared/src/schemas/tenant.ts`
- Test: `packages/shared/src/schemas/auth.test.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@app/shared",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run" },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```

- [ ] **Step 2: Create `packages/shared/src/types.ts`**

```ts
export type Role = "owner" | "manager" | "cashier";
export type Sector = "grosir" | "retail" | "fnb" | "jasa" | "apotek";
export type TenantStatus = "active" | "suspended";

export interface JwtPayload {
  sub: string;            // user id
  tenantId: string | null; // null for platform admins
  role: Role | "platform_admin";
}
```

- [ ] **Step 3: Write the failing test**

`packages/shared/src/schemas/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loginSchema, registerTenantSchema } from "./auth";

describe("auth schemas", () => {
  it("accepts a valid login", () => {
    expect(loginSchema.parse({ email: "a@b.com", password: "secret12" })).toBeTruthy();
  });
  it("rejects a short password", () => {
    expect(() => loginSchema.parse({ email: "a@b.com", password: "x" })).toThrow();
  });
  it("rejects a bad sector on register", () => {
    expect(() =>
      registerTenantSchema.parse({
        name: "Toko A", slug: "toko-a", sector: "spaceship",
        ownerEmail: "o@b.com", ownerPassword: "secret12",
      })
    ).toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @app/shared test`
Expected: FAIL — cannot find module `./auth`.

- [ ] **Step 5: Create `packages/shared/src/schemas/auth.ts`**

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerTenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sector: z.enum(["grosir", "retail", "fnb", "jasa", "apotek"]),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;
```

- [ ] **Step 6: Create `packages/shared/src/schemas/tenant.ts`**

```ts
import { z } from "zod";

export const tenantStatusSchema = z.enum(["active", "suspended"]);
export const updateTenantStatusSchema = z.object({ status: tenantStatusSchema });
```

- [ ] **Step 7: Create `packages/shared/src/index.ts`**

```ts
export * from "./types";
export * from "./schemas/auth";
export * from "./schemas/tenant";
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @app/shared test`
Expected: PASS — 3 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat: add shared types and zod schemas"
```

---

## Phase 1 — Multi-tenancy core

### Task 5: Migration 001 — platform tables

**Files:**
- Create: `db/migrations/001_platform.sql`

- [ ] **Step 1: Create `db/migrations/001_platform.sql`**

```sql
create extension if not exists pgcrypto;

-- uuid v7 helper (time-sortable)
create or replace function uuid_v7() returns uuid as $$
  select encode(
    set_byte(
      set_byte(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
                from 1 for 6),
        6, (b'0111' || get_byte(uuid_send(gen_random_uuid()), 6)::bit(4))::bit(8)::int),
      8, (b'10' || get_byte(uuid_send(gen_random_uuid()), 8)::bit(6))::bit(8)::int),
    'hex')::uuid;
$$ language sql volatile;

create table platform_admins (
  id            uuid primary key default uuid_v7(),
  email         text unique not null,
  password_hash text not null,
  name          text not null,
  created_at    timestamptz not null default now()
);

create table tenants (
  id         uuid primary key default uuid_v7(),
  name       text not null,
  slug       text unique not null,
  sector     text not null check (sector in ('grosir','retail','fnb','jasa','apotek')),
  status     text not null default 'active' check (status in ('active','suspended')),
  settings   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table platform_audit_log (
  id         uuid primary key default uuid_v7(),
  admin_id   uuid references platform_admins(id),
  action     text not null,
  target     text,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Run the migration**

Run: `docker compose up -d db && cp .env.example .env && pnpm migrate`
Expected: prints `applied 001_platform.sql`.

- [ ] **Step 3: Verify tables exist**

Run: `docker compose exec db psql -U app -d operational -c "\dt"`
Expected: lists `platform_admins`, `tenants`, `platform_audit_log`, `_migrations`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/001_platform.sql
git commit -m "feat: add platform tables migration"
```

### Task 6: Migration 002 — users, DB roles, RLS

**Files:**
- Create: `db/migrations/002_users_rls.sql`, `db/seeds/dev_seed.sql`

- [ ] **Step 1: Create `db/migrations/002_users_rls.sql`**

```sql
-- DB roles. app_admin bypasses RLS for platform queries.
do $$ begin
  if not exists (select from pg_roles where rolname = 'app_admin') then
    create role app_admin login password 'admin_dev_pw' bypassrls;
  end if;
end $$;
grant all on all tables in schema public to app_admin;
alter default privileges in schema public grant all on tables to app_admin;

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

create policy users_tenant_isolation on users
  using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

grant select, insert, update, delete on users to app;
```

- [ ] **Step 2: Create `db/seeds/dev_seed.sql`**

```sql
-- dev-only: one platform admin (password: "admin123" — argon2 hash placeholder
-- will be replaced by the seed script in Task 19's verify step or set manually).
-- For now insert via the API once it exists; this file documents intent.
-- Local quick start: register the first admin with:
--   psql ... -c "insert into platform_admins(email,password_hash,name)
--               values ('admin@local','<hash>','Local Admin');"
```

- [ ] **Step 3: Run the migration**

Run: `pnpm migrate`
Expected: prints `applied 002_users_rls.sql`.

- [ ] **Step 4: Verify the tenant role cannot bypass RLS**

Run:
```bash
docker compose exec db psql -U app -d operational -c \
  "select count(*) from users;"
```
Expected: returns `0` (RLS active, no tenant context set → zero rows, not an error).

- [ ] **Step 5: Re-run Task 3 pool test**

Run: `pnpm --filter @app/api test pool`
Expected: PASS — both tenant and admin pools connect.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/002_users_rls.sql db/seeds/dev_seed.sql
git commit -m "feat: add users table, db roles, and RLS policy"
```

### Task 7: Password hashing utility

**Files:**
- Create: `apps/api/src/lib/password.ts`
- Test: `apps/api/src/lib/password.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/lib/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("hashes then verifies the same password", async () => {
    const hash = await hashPassword("secret12");
    expect(hash).not.toBe("secret12");
    expect(await verifyPassword(hash, "secret12")).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const hash = await hashPassword("secret12");
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test password`
Expected: FAIL — cannot find module `./password`.

- [ ] **Step 3: Create `apps/api/src/lib/password.ts`**

```ts
import argon2 from "argon2";

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/api test password`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/password.ts apps/api/src/lib/password.test.ts
git commit -m "feat: add argon2 password hashing"
```

### Task 8: JWT utility

**Files:**
- Create: `apps/api/src/lib/jwt.ts`
- Test: `apps/api/src/lib/jwt.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/lib/jwt.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signAccess, signRefresh, verifyAccess, verifyRefresh } from "./jwt";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
  process.env.REFRESH_TOKEN_TTL = "1209600";
});

const payload = { sub: "u1", tenantId: "t1", role: "owner" as const };

describe("jwt", () => {
  it("signs and verifies an access token", async () => {
    const token = await signAccess(payload);
    const decoded = await verifyAccess(token);
    expect(decoded.sub).toBe("u1");
    expect(decoded.role).toBe("owner");
  });
  it("rejects an access token verified as refresh", async () => {
    const token = await signAccess(payload);
    await expect(verifyRefresh(token)).rejects.toThrow();
  });
  it("signs and verifies a refresh token with a jti", async () => {
    const { token, jti } = await signRefresh(payload);
    const decoded = await verifyRefresh(token);
    expect(decoded.jti).toBe(jti);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test jwt`
Expected: FAIL — cannot find module `./jwt`.

- [ ] **Step 3: Create `apps/api/src/lib/jwt.ts`**

```ts
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import type { JwtPayload } from "@app/shared";

const enc = (s: string) => new TextEncoder().encode(s);
const accessSecret = () => enc(process.env.JWT_ACCESS_SECRET!);
const refreshSecret = () => enc(process.env.JWT_REFRESH_SECRET!);

export async function signAccess(p: JwtPayload): Promise<string> {
  return new SignJWT({ tenantId: p.tenantId, role: p.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${process.env.ACCESS_TOKEN_TTL}s`)
    .sign(accessSecret());
}

export async function signRefresh(p: JwtPayload): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  const token = await new SignJWT({ tenantId: p.tenantId, role: p.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${process.env.REFRESH_TOKEN_TTL}s`)
    .sign(refreshSecret());
  return { token, jti };
}

export async function verifyAccess(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, accessSecret());
  return { sub: payload.sub!, tenantId: (payload.tenantId as string) ?? null, role: payload.role as JwtPayload["role"] };
}

export async function verifyRefresh(token: string): Promise<JwtPayload & { jti: string }> {
  const { payload } = await jwtVerify(token, refreshSecret());
  return {
    sub: payload.sub!,
    tenantId: (payload.tenantId as string) ?? null,
    role: payload.role as JwtPayload["role"],
    jti: payload.jti!,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/api test jwt`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/jwt.ts apps/api/src/lib/jwt.test.ts
git commit -m "feat: add jwt sign/verify for access and refresh tokens"
```

### Task 9: Redis client + refresh token store

**Files:**
- Create: `apps/api/src/lib/redis.ts`, `apps/api/src/lib/refreshStore.ts`
- Test: `apps/api/src/lib/refreshStore.test.ts`

- [ ] **Step 1: Create `apps/api/src/lib/redis.ts`**

```ts
import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/lib/refreshStore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { saveRefresh, isRefreshValid, revokeRefresh } from "./refreshStore";

describe("refresh store", () => {
  it("saves a jti then validates it", async () => {
    await saveRefresh("user1", "jti-1", 60);
    expect(await isRefreshValid("user1", "jti-1")).toBe(true);
  });
  it("returns false for an unknown jti", async () => {
    expect(await isRefreshValid("user1", "nope")).toBe(false);
  });
  it("revokes a jti", async () => {
    await saveRefresh("user2", "jti-2", 60);
    await revokeRefresh("user2", "jti-2");
    expect(await isRefreshValid("user2", "jti-2")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `docker compose up -d redis` then `pnpm --filter @app/api test refreshStore`
Expected: FAIL — cannot find module `./refreshStore`.

- [ ] **Step 4: Create `apps/api/src/lib/refreshStore.ts`**

```ts
import { redis } from "./redis";

const key = (userId: string, jti: string) => `refresh:${userId}:${jti}`;

export async function saveRefresh(userId: string, jti: string, ttlSeconds: number): Promise<void> {
  await redis.set(key(userId, jti), "1", "EX", ttlSeconds);
}

export async function isRefreshValid(userId: string, jti: string): Promise<boolean> {
  return (await redis.exists(key(userId, jti))) === 1;
}

export async function revokeRefresh(userId: string, jti: string): Promise<void> {
  await redis.del(key(userId, jti));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/api test refreshStore`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/redis.ts apps/api/src/lib/refreshStore.ts apps/api/src/lib/refreshStore.test.ts
git commit -m "feat: add redis client and refresh token store"
```

### Task 10: Error type + Hono error middleware + app skeleton

**Files:**
- Create: `apps/api/src/lib/errors.ts`, `apps/api/src/middleware/error.ts`, `apps/api/src/index.ts`, `apps/api/tsconfig.json`
- Test: `apps/api/src/lib/errors.test.ts`

- [ ] **Step 1: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/lib/errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AppError } from "./errors";

describe("AppError", () => {
  it("carries a status, code, and message", () => {
    const e = new AppError(404, "not_found", "Tenant not found");
    expect(e.status).toBe(404);
    expect(e.code).toBe("not_found");
    expect(e.message).toBe("Tenant not found");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @app/api test errors`
Expected: FAIL — cannot find module `./errors`.

- [ ] **Step 4: Create `apps/api/src/lib/errors.ts`**

```ts
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
```

- [ ] **Step 5: Create `apps/api/src/middleware/error.ts`**

```ts
import type { Context } from "hono";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";

export function onError(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
  }
  if (err instanceof ZodError) {
    return c.json({ error: { code: "validation_error", message: "Invalid input", details: err.flatten() } }, 400);
  }
  console.error(err);
  return c.json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
}
```

- [ ] **Step 6: Create `apps/api/src/index.ts`**

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { onError } from "./middleware/error";

const app = new Hono();
app.onError(onError);
app.get("/health", (c) => c.json({ ok: true }));

// Routers mounted in later tasks:
// app.route("/api/v1/auth", authRoutes);
// app.route("/api/v1/admin", adminRoutes);
// app.route("/api/v1/t", tenantRoutes);

serve({ fetch: app.fetch, port: Number(process.env.API_PORT ?? 4000) });
console.log(`api listening on ${process.env.API_PORT ?? 4000}`);

export { app };
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @app/api test errors`
Expected: PASS — 1 test.

- [ ] **Step 8: Commit**

```bash
git add apps/api/tsconfig.json apps/api/src/lib/errors.ts apps/api/src/middleware/error.ts apps/api/src/index.ts apps/api/src/lib/errors.test.ts
git commit -m "feat: add AppError, error middleware, and hono app skeleton"
```

### Task 11: `withTenant` transaction helper

This helper opens a transaction on the tenant pool, sets `app.current_tenant_id` with `SET LOCAL`, runs the callback, and commits. It is the only correct way to run tenant-scoped queries.

**Files:**
- Create: `apps/api/src/db/withTenant.ts`
- Test: `apps/api/src/db/withTenant.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/db/withTenant.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withTenant, withAdmin } from "./withTenant";
import { adminPool } from "./pool";

describe("withTenant", () => {
  it("sets the RLS context so a tenant only sees its own rows", async () => {
    // Arrange: two tenants + one user each, inserted via the admin (BYPASSRLS) pool.
    const a = await adminPool.query(
      "insert into tenants(name,slug,sector) values ('A','wt-a','grosir') returning id"
    );
    const b = await adminPool.query(
      "insert into tenants(name,slug,sector) values ('B','wt-b','grosir') returning id"
    );
    const tenantA = a.rows[0].id, tenantB = b.rows[0].id;
    await adminPool.query(
      "insert into users(tenant_id,email,password_hash,name,role) values ($1,'u@a','h','UA','owner')",
      [tenantA]
    );
    await adminPool.query(
      "insert into users(tenant_id,email,password_hash,name,role) values ($1,'u@b','h','UB','owner')",
      [tenantB]
    );

    // Act + Assert: tenant A context sees exactly one user, and it is tenant A's.
    const rows = await withTenant(tenantA, async (q) => (await q("select tenant_id from users")).rows);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(tenantA);
  });

  it("withAdmin sees rows across all tenants", async () => {
    const all = await withAdmin(async (q) => (await q("select count(*)::int as n from tenants")).rows[0].n);
    expect(all).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test withTenant`
Expected: FAIL — cannot find module `./withTenant`.

- [ ] **Step 3: Create `apps/api/src/db/withTenant.ts`**

```ts
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { tenantPool, adminPool } from "./pool";

export type Query = <R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<R>>;

/** Run a callback inside a transaction scoped to one tenant (RLS enforced). */
export async function withTenant<T>(tenantId: string, fn: (q: Query) => Promise<T>): Promise<T> {
  const client: PoolClient = await tenantPool.connect();
  try {
    await client.query("begin");
    await client.query("set local app.current_tenant_id = $1", [tenantId]);
    const q: Query = (text, params) => client.query(text, params as unknown[]);
    const result = await fn(q);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** Run a callback against the BYPASSRLS admin pool (platform-level queries). */
export async function withAdmin<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  const client: PoolClient = await adminPool.connect();
  try {
    await client.query("begin");
    const q: Query = (text, params) => client.query(text, params as unknown[]);
    const result = await fn(q);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/api test withTenant`
Expected: PASS — 2 tests. The first proves RLS isolation works.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/withTenant.ts apps/api/src/db/withTenant.test.ts
git commit -m "feat: add withTenant/withAdmin transaction helpers"
```

### Task 12: Auth + role middleware

**Files:**
- Create: `apps/api/src/middleware/auth.ts`, `apps/api/src/middleware/requireRole.ts`
- Test: `apps/api/src/middleware/auth.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/middleware/auth.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "./auth";
import { requireRole } from "./requireRole";
import { signAccess } from "../lib/jwt";
import { onError } from "./error";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
});

function makeApp() {
  const app = new Hono();
  app.onError(onError);
  app.use("/protected/*", authMiddleware);
  app.get("/protected/me", (c) => c.json(c.get("auth")));
  app.get("/protected/owner-only", requireRole("owner"), (c) => c.json({ ok: true }));
  return app;
}

describe("authMiddleware", () => {
  it("rejects a request with no token", async () => {
    const res = await makeApp().request("/protected/me");
    expect(res.status).toBe(401);
  });
  it("attaches the auth payload for a valid token", async () => {
    const token = await signAccess({ sub: "u1", tenantId: "t1", role: "owner" });
    const res = await makeApp().request("/protected/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe("owner");
  });
  it("requireRole blocks the wrong role", async () => {
    const token = await signAccess({ sub: "u1", tenantId: "t1", role: "cashier" });
    const res = await makeApp().request("/protected/owner-only", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test middleware/auth`
Expected: FAIL — cannot find module `./auth`.

- [ ] **Step 3: Create `apps/api/src/middleware/auth.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import { verifyAccess } from "../lib/jwt";
import { AppError } from "../lib/errors";
import type { JwtPayload } from "@app/shared";

declare module "hono" {
  interface ContextVariableMap {
    auth: JwtPayload;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "unauthorized", "Missing bearer token");
  }
  try {
    const payload = await verifyAccess(header.slice(7));
    c.set("auth", payload);
  } catch {
    throw new AppError(401, "unauthorized", "Invalid or expired token");
  }
  await next();
};
```

- [ ] **Step 4: Create `apps/api/src/middleware/requireRole.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors";
import type { JwtPayload } from "@app/shared";

type Allowed = JwtPayload["role"];

export function requireRole(...roles: Allowed[]): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth || !roles.includes(auth.role)) {
      throw new AppError(403, "forbidden", "You do not have access to this action");
    }
    await next();
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/api test middleware/auth`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/middleware/requireRole.ts apps/api/src/middleware/auth.test.ts
git commit -m "feat: add auth and role middleware"
```

### Task 13: Auth service

Login for platform admins and tenant users, token refresh with rotation, and logout.

**Files:**
- Create: `apps/api/src/services/auth.service.ts`
- Test: `apps/api/src/services/auth.service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/services/auth.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../db/pool";
import { hashPassword } from "../lib/password";
import { loginTenantUser, loginPlatformAdmin, refresh, logout } from "./auth.service";
import { AppError } from "../lib/errors";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
  process.env.REFRESH_TOKEN_TTL = "1209600";
});

describe("auth.service", () => {
  it("logs in a tenant user with the right password", async () => {
    const hash = await hashPassword("secret12");
    const t = await adminPool.query(
      "insert into tenants(name,slug,sector) values ('AuthCo','authco','grosir') returning id"
    );
    const tenantId = t.rows[0].id;
    await adminPool.query(
      "insert into users(tenant_id,email,password_hash,name,role) values ($1,'u@authco','" +
        "' || $2, 'U', 'owner')".replace("' || $2", "$2"),
      [tenantId, hash]
    );

    const result = await loginTenantUser("authco", "u@authco", "secret12");
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.role).toBe("owner");
  });

  it("rejects a wrong password", async () => {
    await expect(loginTenantUser("authco", "u@authco", "wrong")).rejects.toBeInstanceOf(AppError);
  });

  it("logs in a platform admin", async () => {
    const hash = await hashPassword("admin123");
    await adminPool.query(
      "insert into platform_admins(email,password_hash,name) values ('pa@local',$1,'PA')",
      [hash]
    );
    const result = await loginPlatformAdmin("pa@local", "admin123");
    expect(result.accessToken).toBeTruthy();
    expect(result.admin.email).toBe("pa@local");
  });

  it("refresh rotates the token and logout invalidates it", async () => {
    const login = await loginPlatformAdmin("pa@local", "admin123");
    const rotated = await refresh(login.refreshToken);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    // old token no longer valid after rotation
    await expect(refresh(login.refreshToken)).rejects.toBeInstanceOf(AppError);
    await logout(rotated.refreshToken);
    await expect(refresh(rotated.refreshToken)).rejects.toBeInstanceOf(AppError);
  });
});
```

> Note: the awkward string in the first test is just to keep the insert parameterised — when implementing, simplify to a clean parameterised insert. The behaviour asserted is what matters.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test auth.service`
Expected: FAIL — cannot find module `./auth.service`.

- [ ] **Step 3: Create `apps/api/src/services/auth.service.ts`**

```ts
import { withAdmin } from "../db/withTenant";
import { verifyPassword } from "../lib/password";
import { signAccess, signRefresh, verifyRefresh } from "../lib/jwt";
import { saveRefresh, isRefreshValid, revokeRefresh } from "../lib/refreshStore";
import { AppError } from "../lib/errors";
import type { JwtPayload, Role } from "@app/shared";

const refreshTtl = () => Number(process.env.REFRESH_TOKEN_TTL ?? 1209600);

async function issue(payload: JwtPayload) {
  const accessToken = await signAccess(payload);
  const { token: refreshToken, jti } = await signRefresh(payload);
  await saveRefresh(payload.sub, jti, refreshTtl());
  return { accessToken, refreshToken };
}

export async function loginTenantUser(slug: string, email: string, password: string) {
  const row = await withAdmin(async (q) => {
    const r = await q<{
      id: string; tenant_id: string; password_hash: string; name: string; role: Role; status: string;
      tenant_status: string;
    }>(
      `select u.id, u.tenant_id, u.password_hash, u.name, u.role, u.status,
              t.status as tenant_status
         from users u join tenants t on t.id = u.tenant_id
        where t.slug = $1 and u.email = $2`,
      [slug, email]
    );
    return r.rows[0];
  });
  if (!row || !(await verifyPassword(row.password_hash, password))) {
    throw new AppError(401, "invalid_credentials", "Email or password is incorrect");
  }
  if (row.status !== "active" || row.tenant_status !== "active") {
    throw new AppError(403, "account_disabled", "This account or tenant is suspended");
  }
  const payload: JwtPayload = { sub: row.id, tenantId: row.tenant_id, role: row.role };
  const tokens = await issue(payload);
  return { ...tokens, user: { id: row.id, name: row.name, role: row.role, tenantId: row.tenant_id } };
}

export async function loginPlatformAdmin(email: string, password: string) {
  const row = await withAdmin(async (q) => {
    const r = await q<{ id: string; password_hash: string; name: string; email: string }>(
      "select id, password_hash, name, email from platform_admins where email = $1",
      [email]
    );
    return r.rows[0];
  });
  if (!row || !(await verifyPassword(row.password_hash, password))) {
    throw new AppError(401, "invalid_credentials", "Email or password is incorrect");
  }
  const payload: JwtPayload = { sub: row.id, tenantId: null, role: "platform_admin" };
  const tokens = await issue(payload);
  return { ...tokens, admin: { id: row.id, name: row.name, email: row.email } };
}

export async function refresh(refreshToken: string) {
  let decoded;
  try {
    decoded = await verifyRefresh(refreshToken);
  } catch {
    throw new AppError(401, "invalid_refresh", "Refresh token is invalid or expired");
  }
  if (!(await isRefreshValid(decoded.sub, decoded.jti))) {
    throw new AppError(401, "invalid_refresh", "Refresh token has been revoked");
  }
  // rotation: revoke the old jti, issue a fresh pair
  await revokeRefresh(decoded.sub, decoded.jti);
  const payload: JwtPayload = { sub: decoded.sub, tenantId: decoded.tenantId, role: decoded.role };
  return issue(payload);
}

export async function logout(refreshToken: string) {
  try {
    const decoded = await verifyRefresh(refreshToken);
    await revokeRefresh(decoded.sub, decoded.jti);
  } catch {
    // already invalid — nothing to do
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/api test auth.service`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/auth.service.ts apps/api/src/services/auth.service.test.ts
git commit -m "feat: add auth service with login, refresh rotation, logout"
```

### Task 14: Auth routes

**Files:**
- Create: `apps/api/src/routes/auth.routes.ts`
- Modify: `apps/api/src/index.ts` (mount the router)
- Test: `apps/api/src/routes/auth.routes.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/routes/auth.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { authRoutes } from "./auth.routes";
import { onError } from "../middleware/error";
import { adminPool } from "../db/pool";
import { hashPassword } from "../lib/password";

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
  process.env.REFRESH_TOKEN_TTL = "1209600";
  const hash = await hashPassword("secret12");
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('RouteCo','routeco','grosir') returning id"
  );
  await adminPool.query(
    "insert into users(tenant_id,email,password_hash,name,role) values ($1,'u@routeco',$2,'U','manager')",
    [t.rows[0].id, hash]
  );
});

function app() {
  const a = new Hono();
  a.onError(onError);
  a.route("/api/v1/auth", authRoutes);
  return a;
}

describe("auth routes", () => {
  it("POST /tenant-login returns tokens", async () => {
    const res = await app().request("/api/v1/auth/tenant-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "routeco", email: "u@routeco", password: "secret12" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
  });
  it("POST /tenant-login rejects bad input with 400", async () => {
    const res = await app().request("/api/v1/auth/tenant-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "routeco", email: "not-an-email", password: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test auth.routes`
Expected: FAIL — cannot find module `./auth.routes`.

- [ ] **Step 3: Create `apps/api/src/routes/auth.routes.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import { loginSchema } from "@app/shared";
import { loginTenantUser, loginPlatformAdmin, refresh, logout } from "../services/auth.service";

const tenantLoginSchema = loginSchema.extend({ slug: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export const authRoutes = new Hono();

authRoutes.post("/tenant-login", async (c) => {
  const { slug, email, password } = tenantLoginSchema.parse(await c.req.json());
  return c.json(await loginTenantUser(slug, email, password));
});

authRoutes.post("/admin-login", async (c) => {
  const { email, password } = loginSchema.parse(await c.req.json());
  return c.json(await loginPlatformAdmin(email, password));
});

authRoutes.post("/refresh", async (c) => {
  const { refreshToken } = refreshSchema.parse(await c.req.json());
  return c.json(await refresh(refreshToken));
});

authRoutes.post("/logout", async (c) => {
  const { refreshToken } = refreshSchema.parse(await c.req.json());
  await logout(refreshToken);
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Mount the router in `apps/api/src/index.ts`**

Replace the commented router block with:

```ts
import { authRoutes } from "./routes/auth.routes";
app.route("/api/v1/auth", authRoutes);
// app.route("/api/v1/admin", adminRoutes);   // Task 15
// app.route("/api/v1/t", tenantRoutes);      // Task 19
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/api test auth.routes`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.routes.ts apps/api/src/index.ts apps/api/src/routes/auth.routes.test.ts
git commit -m "feat: add auth routes"
```

### Task 15: Tenant service

Creates a tenant together with its owner user (one transaction), lists/gets tenants, updates status, writes the audit log. Provisioning enqueue is added in Task 17.

**Files:**
- Create: `apps/api/src/services/tenant.service.ts`
- Test: `apps/api/src/services/tenant.service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/services/tenant.service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createTenant, listTenants, getTenant, setTenantStatus } from "./tenant.service";
import { AppError } from "../lib/errors";

describe("tenant.service", () => {
  it("creates a tenant with an owner user", async () => {
    const t = await createTenant(
      { name: "Sembako Jaya", slug: "sembako-jaya", sector: "grosir",
        ownerEmail: "owner@sj.com", ownerPassword: "secret12" },
      "admin-id-1"
    );
    expect(t.id).toBeTruthy();
    expect(t.sector).toBe("grosir");

    const fetched = await getTenant(t.id);
    expect(fetched.owner.email).toBe("owner@sj.com");
    expect(fetched.owner.role).toBe("owner");
  });

  it("rejects a duplicate slug", async () => {
    await expect(
      createTenant(
        { name: "Dup", slug: "sembako-jaya", sector: "grosir",
          ownerEmail: "x@y.com", ownerPassword: "secret12" },
        "admin-id-1"
      )
    ).rejects.toBeInstanceOf(AppError);
  });

  it("lists tenants and filters by status", async () => {
    const all = await listTenants({});
    expect(all.length).toBeGreaterThanOrEqual(1);
    const t = all[0];
    await setTenantStatus(t.id, "suspended", "admin-id-1");
    const suspended = await listTenants({ status: "suspended" });
    expect(suspended.some((x) => x.id === t.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test tenant.service`
Expected: FAIL — cannot find module `./tenant.service`.

- [ ] **Step 3: Create `apps/api/src/services/tenant.service.ts`**

```ts
import { withAdmin } from "../db/withTenant";
import { hashPassword } from "../lib/password";
import { AppError } from "../lib/errors";
import type { RegisterTenantInput, Sector, TenantStatus } from "@app/shared";

export interface TenantRow {
  id: string; name: string; slug: string; sector: Sector;
  status: TenantStatus; created_at: string;
}

async function audit(q: import("../db/withTenant").Query, adminId: string, action: string, target: string) {
  await q("insert into platform_audit_log(admin_id, action, target) values ($1,$2,$3)", [adminId, action, target]);
}

export async function createTenant(input: RegisterTenantInput, adminId: string): Promise<TenantRow> {
  const passwordHash = await hashPassword(input.ownerPassword);
  return withAdmin(async (q) => {
    const dup = await q("select 1 from tenants where slug = $1", [input.slug]);
    if (dup.rowCount) throw new AppError(409, "slug_taken", "That slug is already in use");

    const t = await q<TenantRow>(
      `insert into tenants(name, slug, sector) values ($1,$2,$3)
       returning id, name, slug, sector, status, created_at`,
      [input.name, input.slug, input.sector]
    );
    const tenant = t.rows[0];
    await q(
      `insert into users(tenant_id, email, password_hash, name, role)
       values ($1,$2,$3,$4,'owner')`,
      [tenant.id, input.ownerEmail, passwordHash, input.name + " Owner"]
    );
    await audit(q, adminId, "tenant.create", tenant.id);
    return tenant;
  });
}

export async function listTenants(filter: { status?: TenantStatus; search?: string }): Promise<TenantRow[]> {
  return withAdmin(async (q) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
    if (filter.search) { params.push(`%${filter.search}%`); where.push(`name ilike $${params.length}`); }
    const sql =
      `select id, name, slug, sector, status, created_at from tenants` +
      (where.length ? ` where ${where.join(" and ")}` : "") +
      ` order by created_at desc`;
    return (await q<TenantRow>(sql, params)).rows;
  });
}

export async function getTenant(id: string) {
  return withAdmin(async (q) => {
    const t = await q<TenantRow>(
      "select id, name, slug, sector, status, created_at from tenants where id = $1",
      [id]
    );
    if (!t.rowCount) throw new AppError(404, "not_found", "Tenant not found");
    const users = await q<{ id: string; email: string; name: string; role: string; status: string }>(
      "select id, email, name, role, status from users where tenant_id = $1 order by created_at",
      [id]
    );
    const owner = users.rows.find((u) => u.role === "owner")!;
    return { ...t.rows[0], users: users.rows, owner };
  });
}

export async function setTenantStatus(id: string, status: TenantStatus, adminId: string) {
  return withAdmin(async (q) => {
    const r = await q("update tenants set status = $1 where id = $2", [status, id]);
    if (!r.rowCount) throw new AppError(404, "not_found", "Tenant not found");
    await audit(q, adminId, `tenant.${status}`, id);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/api test tenant.service`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/tenant.service.ts apps/api/src/services/tenant.service.test.ts
git commit -m "feat: add tenant service"
```

### Task 16: Admin routes

Platform-admin endpoints. A small `requirePlatformAdmin` guard reuses `requireRole("platform_admin")`.

**Files:**
- Create: `apps/api/src/routes/admin.routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/routes/admin.routes.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/routes/admin.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { adminRoutes } from "./admin.routes";
import { onError } from "../middleware/error";
import { signAccess } from "../lib/jwt";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
});

function app() {
  const a = new Hono();
  a.onError(onError);
  a.route("/api/v1/admin", adminRoutes);
  return a;
}

describe("admin routes", () => {
  it("rejects a tenant-role token with 403", async () => {
    const token = await signAccess({ sub: "u1", tenantId: "t1", role: "owner" });
    const res = await app().request("/api/v1/admin/tenants", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("creates and lists a tenant for a platform admin", async () => {
    const token = await signAccess({ sub: "admin-routes-1", tenantId: null, role: "platform_admin" });
    const create = await app().request("/api/v1/admin/tenants", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Admin Route Co", slug: "admin-route-co", sector: "grosir",
        ownerEmail: "o@arc.com", ownerPassword: "secret12",
      }),
    });
    expect(create.status).toBe(201);

    const list = await app().request("/api/v1/admin/tenants", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.some((t: { slug: string }) => t.slug === "admin-route-co")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test admin.routes`
Expected: FAIL — cannot find module `./admin.routes`.

- [ ] **Step 3: Create `apps/api/src/routes/admin.routes.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { registerTenantSchema, updateTenantStatusSchema } from "@app/shared";
import { createTenant, listTenants, getTenant, setTenantStatus } from "../services/tenant.service";

export const adminRoutes = new Hono();

adminRoutes.use("*", authMiddleware, requireRole("platform_admin"));

adminRoutes.get("/tenants", async (c) => {
  const status = c.req.query("status");
  const search = c.req.query("search");
  const filter = z
    .object({ status: z.enum(["active", "suspended"]).optional(), search: z.string().optional() })
    .parse({ status: status || undefined, search: search || undefined });
  return c.json(await listTenants(filter));
});

adminRoutes.post("/tenants", async (c) => {
  const input = registerTenantSchema.parse(await c.req.json());
  const tenant = await createTenant(input, c.get("auth").sub);
  return c.json(tenant, 201);
});

adminRoutes.get("/tenants/:id", async (c) => {
  return c.json(await getTenant(c.req.param("id")));
});

adminRoutes.patch("/tenants/:id/status", async (c) => {
  const { status } = updateTenantStatusSchema.parse(await c.req.json());
  await setTenantStatus(c.req.param("id"), status, c.get("auth").sub);
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Mount the router in `apps/api/src/index.ts`**

Replace the `// app.route("/api/v1/admin", adminRoutes);` line with:

```ts
import { adminRoutes } from "./routes/admin.routes";
app.route("/api/v1/admin", adminRoutes);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/api test admin.routes`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin.routes.ts apps/api/src/index.ts apps/api/src/routes/admin.routes.test.ts
git commit -m "feat: add platform admin routes"
```

### Task 17: BullMQ queues + worker entrypoint

Defines the queues (typed) and the worker process that consumes them. Job processors are added in Tasks 18–19 and Phase 2.

**Files:**
- Create: `apps/api/src/queue/queues.ts`, `apps/api/src/worker.ts`
- Test: `apps/api/src/queue/queues.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/queue/queues.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { provisioningQueue, emailQueue } from "./queues";

describe("queues", () => {
  it("enqueues a provisioning job and reads it back", async () => {
    const job = await provisioningQueue.add("provision", { tenantId: "t-queue-1" });
    expect(job.id).toBeTruthy();
    const fetched = await provisioningQueue.getJob(job.id!);
    expect(fetched?.data.tenantId).toBe("t-queue-1");
    await fetched?.remove();
  });
  it("email queue accepts a job", async () => {
    const job = await emailQueue.add("email", { to: "a@b.com", template: "welcome", vars: {} });
    expect(job.id).toBeTruthy();
    await job.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test queues`
Expected: FAIL — cannot find module `./queues`.

- [ ] **Step 3: Create `apps/api/src/queue/queues.ts`**

```ts
import { Queue } from "bullmq";
import { redis } from "../lib/redis";

const connection = redis;

export interface ProvisioningJob { tenantId: string }
export interface EmailJob {
  to: string;
  template: "welcome" | "invite" | "password_reset";
  vars: Record<string, string>;
}
export interface LowStockScanJob { /* no payload — scans all tenants */ }
export interface ExportJob { exportJobId: string; tenantId: string }

export const provisioningQueue = new Queue<ProvisioningJob>("provisioning", { connection });
export const emailQueue = new Queue<EmailJob>("email", { connection });
export const lowStockQueue = new Queue<LowStockScanJob>("low-stock-scan", { connection });
export const exportQueue = new Queue<ExportJob>("export-generation", { connection });

export const QUEUE_NAMES = ["provisioning", "email", "low-stock-scan", "export-generation"] as const;
```

- [ ] **Step 4: Create `apps/api/src/worker.ts`**

```ts
import { Worker } from "bullmq";
import { redis } from "./lib/redis";
import { provisioningProcessor } from "./queue/jobs/provisioning";
import { emailProcessor } from "./queue/jobs/email";
import { lowStockProcessor } from "./queue/jobs/lowStockScan";
import { exportProcessor } from "./queue/jobs/exportGeneration";
import { lowStockQueue } from "./queue/queues";

const connection = redis;

new Worker("provisioning", provisioningProcessor, { connection });
new Worker("email", emailProcessor, { connection });
new Worker("low-stock-scan", lowStockProcessor, { connection });
new Worker("export-generation", exportProcessor, { connection });

// repeatable low-stock scan, hourly
await lowStockQueue.add(
  "scan",
  {},
  { repeat: { pattern: "0 * * * *" }, jobId: "low-stock-hourly" }
);

console.log("worker started: provisioning, email, low-stock-scan, export-generation");
```

> Note: `provisioning.ts` and `email.ts` are created in Tasks 18–19; `lowStockScan.ts` and `exportGeneration.ts` in Phase 2. The worker will not compile until those exist — that is expected. Tasks 18–19 complete the Phase 1 subset; add a temporary no-op export for the two Phase 2 processors if you need the worker to boot before Phase 2 (delete the no-ops in Phase 2).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/api test queues`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/queue/queues.ts apps/api/src/worker.ts apps/api/src/queue/queues.test.ts
git commit -m "feat: add bullmq queues and worker entrypoint"
```

### Task 18: Tenant provisioning job

Seeds default categories, units, and settings for a new tenant, then enqueues the welcome email. Wired into `createTenant`.

**Files:**
- Create: `apps/api/src/queue/jobs/provisioning.ts`
- Modify: `apps/api/src/services/tenant.service.ts` (enqueue after create)
- Test: `apps/api/src/queue/jobs/provisioning.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/queue/jobs/provisioning.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { adminPool } from "../../db/pool";
import { provisioningProcessor } from "./provisioning";
import type { Job } from "bullmq";
import type { ProvisioningJob } from "../queues";

describe("provisioning processor", () => {
  it("seeds default categories and units for the tenant", async () => {
    const t = await adminPool.query(
      "insert into tenants(name,slug,sector) values ('ProvCo','provco','grosir') returning id"
    );
    const tenantId = t.rows[0].id;
    // owner user is required for the welcome email lookup
    await adminPool.query(
      "insert into users(tenant_id,email,password_hash,name,role) values ($1,'o@provco','h','O','owner')",
      [tenantId]
    );

    await provisioningProcessor({ data: { tenantId } } as Job<ProvisioningJob>);

    const cats = await adminPool.query("select count(*)::int n from categories where tenant_id=$1", [tenantId]);
    const units = await adminPool.query("select count(*)::int n from units where tenant_id=$1", [tenantId]);
    expect(cats.rows[0].n).toBeGreaterThan(0);
    expect(units.rows[0].n).toBeGreaterThan(0);
  });
});
```

> Note: this test depends on the `categories` and `units` tables, created in Phase 2's migration 003. Run this test after Task 33 (migration 003). Until then it fails on missing tables — acceptable; mark it skipped with `it.skip` and un-skip in Phase 2 if you want a green Phase 1.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test provisioning`
Expected: FAIL — cannot find module `./provisioning`.

- [ ] **Step 3: Create `apps/api/src/queue/jobs/provisioning.ts`**

```ts
import type { Job } from "bullmq";
import { withAdmin } from "../../db/withTenant";
import { emailQueue, type ProvisioningJob } from "../queues";

const DEFAULT_CATEGORIES = ["Sembako", "Minuman", "Snack", "Kebutuhan Rumah", "Lainnya"];
const DEFAULT_UNITS = ["pcs", "pak", "lusin", "dus", "karton", "sak", "kg"];

export async function provisioningProcessor(job: Job<ProvisioningJob>): Promise<void> {
  const { tenantId } = job.data;
  await withAdmin(async (q) => {
    for (const name of DEFAULT_CATEGORIES) {
      await q(
        "insert into categories(tenant_id, name) values ($1,$2) on conflict do nothing",
        [tenantId, name]
      );
    }
    for (const name of DEFAULT_UNITS) {
      await q(
        "insert into units(tenant_id, name) values ($1,$2) on conflict do nothing",
        [tenantId, name]
      );
    }
    await q(
      "update tenants set settings = settings || '{\"provisioned\": true}' where id = $1",
      [tenantId]
    );
    const owner = await q<{ email: string; name: string }>(
      "select email, name from users where tenant_id = $1 and role = 'owner' limit 1",
      [tenantId]
    );
    if (owner.rowCount) {
      await emailQueue.add("welcome", {
        to: owner.rows[0].email,
        template: "welcome",
        vars: { name: owner.rows[0].name },
      });
    }
  });
}
```

- [ ] **Step 4: Enqueue provisioning from `tenant.service.ts`**

In `createTenant`, after the `withAdmin(...)` block returns `tenant` and before returning it, add the enqueue. Change the end of `createTenant` to:

```ts
export async function createTenant(input: RegisterTenantInput, adminId: string): Promise<TenantRow> {
  const passwordHash = await hashPassword(input.ownerPassword);
  const tenant = await withAdmin(async (q) => {
    const dup = await q("select 1 from tenants where slug = $1", [input.slug]);
    if (dup.rowCount) throw new AppError(409, "slug_taken", "That slug is already in use");

    const t = await q<TenantRow>(
      `insert into tenants(name, slug, sector) values ($1,$2,$3)
       returning id, name, slug, sector, status, created_at`,
      [input.name, input.slug, input.sector]
    );
    const created = t.rows[0];
    await q(
      `insert into users(tenant_id, email, password_hash, name, role)
       values ($1,$2,$3,$4,'owner')`,
      [created.id, input.ownerEmail, passwordHash, input.name + " Owner"]
    );
    await audit(q, adminId, "tenant.create", created.id);
    return created;
  });
  await provisioningQueue.add("provision", { tenantId: tenant.id });
  return tenant;
}
```

Add the import at the top of the file:

```ts
import { provisioningQueue } from "../queue/queues";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/api test provisioning` (after Phase 2 migration 003, or with `it.skip` for a green Phase 1)
Expected: PASS — 1 test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/queue/jobs/provisioning.ts apps/api/src/services/tenant.service.ts apps/api/src/queue/jobs/provisioning.test.ts
git commit -m "feat: add tenant provisioning job"
```

### Task 19: Email job + SMTP transport

**Files:**
- Create: `apps/api/src/lib/mailer.ts`, `apps/api/src/queue/jobs/email.ts`
- Test: `apps/api/src/queue/jobs/email.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/queue/jobs/email.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { renderEmail } from "./email";

describe("renderEmail", () => {
  it("renders the welcome template with the recipient name", () => {
    const out = renderEmail("welcome", { name: "Budi" });
    expect(out.subject).toMatch(/welcome/i);
    expect(out.html).toContain("Budi");
  });
  it("renders the invite template", () => {
    const out = renderEmail("invite", { name: "Siti", tenant: "Toko Siti" });
    expect(out.html).toContain("Toko Siti");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test jobs/email`
Expected: FAIL — cannot find module `./email`.

- [ ] **Step 3: Create `apps/api/src/lib/mailer.ts`**

```ts
import nodemailer from "nodemailer";

export const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
});

export const MAIL_FROM = process.env.SMTP_FROM ?? "no-reply@operational.app";
```

- [ ] **Step 4: Create `apps/api/src/queue/jobs/email.ts`**

```ts
import type { Job } from "bullmq";
import { mailer, MAIL_FROM } from "../../lib/mailer";
import type { EmailJob } from "../queues";

type Rendered = { subject: string; html: string };

export function renderEmail(template: EmailJob["template"], vars: Record<string, string>): Rendered {
  switch (template) {
    case "welcome":
      return {
        subject: "Welcome to Operational Web App",
        html: `<p>Hi ${vars.name}, your workspace is ready.</p>`,
      };
    case "invite":
      return {
        subject: `You have been invited to ${vars.tenant}`,
        html: `<p>Hi ${vars.name}, you were invited to ${vars.tenant}.</p>`,
      };
    case "password_reset":
      return {
        subject: "Reset your password",
        html: `<p>Hi ${vars.name}, use this link to reset: ${vars.link}</p>`,
      };
  }
}

export async function emailProcessor(job: Job<EmailJob>): Promise<void> {
  const { to, template, vars } = job.data;
  const { subject, html } = renderEmail(template, vars);
  await mailer.sendMail({ from: MAIL_FROM, to, subject, html });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/api test jobs/email`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/mailer.ts apps/api/src/queue/jobs/email.ts apps/api/src/queue/jobs/email.test.ts
git commit -m "feat: add email job and smtp transport"
```

### Task 20: Module registry + tenant router

The tenant router lives at `/api/v1/t/:tenantId`. It authenticates, verifies the token's `tenantId` matches the path, looks up the tenant's `sector`, and mounts that sector's module router from the registry. In Phase 1 the registry is empty of real modules — every tenant gets a `coming-soon` stub. Phase 2 registers the `grosir` module.

**Files:**
- Create: `apps/api/src/modules/registry.ts`, `apps/api/src/routes/tenant.routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/routes/tenant.routes.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/routes/tenant.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { tenantRoutes } from "./tenant.routes";
import { onError } from "../middleware/error";
import { signAccess } from "../lib/jwt";
import { adminPool } from "../db/pool";

let tenantId: string;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('TRoutes','troutes','grosir') returning id"
  );
  tenantId = t.rows[0].id;
});

function app() {
  const a = new Hono();
  a.onError(onError);
  a.route("/api/v1/t", tenantRoutes);
  return a;
}

describe("tenant router", () => {
  it("rejects a token whose tenantId differs from the path", async () => {
    const token = await signAccess({ sub: "u1", tenantId: "other-tenant", role: "owner" });
    const res = await app().request(`/api/v1/t/${tenantId}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns the current context for a matching token", async () => {
    const token = await signAccess({ sub: "u1", tenantId, role: "owner" });
    const res = await app().request(`/api/v1/t/${tenantId}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe(tenantId);
    expect(body.sector).toBe("grosir");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test tenant.routes`
Expected: FAIL — cannot find module `./tenant.routes`.

- [ ] **Step 3: Create `apps/api/src/modules/registry.ts`**

```ts
import type { Hono } from "hono";
import type { Sector } from "@app/shared";

/** A sector module exposes a Hono router mounted under /api/v1/t/:tenantId. */
export interface SectorModule {
  sector: Sector;
  router: Hono;
}

const registry = new Map<Sector, SectorModule>();

export function registerModule(mod: SectorModule): void {
  registry.set(mod.sector, mod);
}

export function getModule(sector: Sector): SectorModule | undefined {
  return registry.get(sector);
}
```

- [ ] **Step 4: Create `apps/api/src/routes/tenant.routes.ts`**

```ts
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../lib/errors";
import { withAdmin } from "../db/withTenant";
import { getModule } from "../modules/registry";
import type { Sector } from "@app/shared";

export const tenantRoutes = new Hono();

// All tenant routes require auth and a tenantId that matches the token.
tenantRoutes.use("/:tenantId/*", authMiddleware, async (c, next) => {
  const auth = c.get("auth");
  const pathTenantId = c.req.param("tenantId");
  if (auth.role === "platform_admin" || auth.tenantId !== pathTenantId) {
    throw new AppError(403, "forbidden", "Token does not belong to this tenant");
  }
  const t = await withAdmin(async (q) =>
    (await q<{ sector: Sector; status: string }>(
      "select sector, status from tenants where id = $1",
      [pathTenantId]
    )).rows[0]
  );
  if (!t) throw new AppError(404, "not_found", "Tenant not found");
  if (t.status !== "active") throw new AppError(403, "tenant_suspended", "Tenant is suspended");
  c.set("sector", t.sector);
  await next();
});

declare module "hono" {
  interface ContextVariableMap {
    sector: Sector;
  }
}

tenantRoutes.get("/:tenantId/me", (c) => {
  const auth = c.get("auth");
  return c.json({ userId: auth.sub, tenantId: auth.tenantId, role: auth.role, sector: c.get("sector") });
});

// Mount the sector module if one is registered; else a coming-soon stub.
tenantRoutes.all("/:tenantId/m/*", async (c) => {
  const mod = getModule(c.get("sector"));
  if (!mod) {
    return c.json({ error: { code: "module_coming_soon", message: "This sector module is not available yet" } }, 404);
  }
  return mod.router.fetch(c.req.raw, c.env);
});
```

> Note: the `/m/*` mount delegates to the module router. The grosir module (Task 34) defines routes relative to `/api/v1/t/:tenantId/m/...`. Keep that prefix consistent when building the module.

- [ ] **Step 5: Mount in `apps/api/src/index.ts`**

Replace `// app.route("/api/v1/t", tenantRoutes);` with:

```ts
import { tenantRoutes } from "./routes/tenant.routes";
import "./modules/grosir";   // registers the grosir module (added in Phase 2)
app.route("/api/v1/t", tenantRoutes);
```

> In Phase 1 the `import "./modules/grosir"` line does not exist yet — add it in Task 34. For Phase 1, mount `tenantRoutes` without that import.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/api test tenant.routes`
Expected: PASS — 2 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/registry.ts apps/api/src/routes/tenant.routes.ts apps/api/src/index.ts apps/api/src/routes/tenant.routes.test.ts
git commit -m "feat: add module registry and tenant router"
```

### Task 21: RLS isolation test suite

A dedicated suite that proves tenant data cannot leak. This is the security backstop for the whole tenancy model.

**Files:**
- Create: `apps/api/src/db/rls-isolation.test.ts`

- [ ] **Step 1: Write the test**

`apps/api/src/db/rls-isolation.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "./pool";
import { withTenant } from "./withTenant";

let tenantA: string, tenantB: string;

beforeAll(async () => {
  const a = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('RLS-A','rls-a','grosir') returning id"
  );
  const b = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('RLS-B','rls-b','grosir') returning id"
  );
  tenantA = a.rows[0].id;
  tenantB = b.rows[0].id;
  await adminPool.query(
    "insert into users(tenant_id,email,password_hash,name,role) values ($1,'a@rls','h','A','owner')",
    [tenantA]
  );
  await adminPool.query(
    "insert into users(tenant_id,email,password_hash,name,role) values ($1,'b@rls','h','B','owner')",
    [tenantB]
  );
});

describe("RLS isolation", () => {
  it("tenant A cannot SELECT tenant B users", async () => {
    const rows = await withTenant(tenantA, async (q) =>
      (await q("select email from users")).rows
    );
    expect(rows.every((r: { email: string }) => r.email === "a@rls")).toBe(true);
  });

  it("tenant A cannot UPDATE tenant B users", async () => {
    const affected = await withTenant(tenantA, async (q) =>
      (await q("update users set name = 'HACKED'")).rowCount
    );
    expect(affected).toBe(1); // only A's own row
    const bUser = await adminPool.query("select name from users where tenant_id = $1", [tenantB]);
    expect(bUser.rows[0].name).not.toBe("HACKED");
  });

  it("tenant A cannot DELETE tenant B users", async () => {
    const affected = await withTenant(tenantA, async (q) =>
      (await q("delete from users where email = 'b@rls'")).rowCount
    );
    expect(affected).toBe(0);
    const bUser = await adminPool.query("select count(*)::int n from users where tenant_id = $1", [tenantB]);
    expect(bUser.rows[0].n).toBe(1);
  });

  it("tenant A cannot INSERT a row for tenant B", async () => {
    await expect(
      withTenant(tenantA, async (q) =>
        q(
          "insert into users(tenant_id,email,password_hash,name,role) values ($1,'evil@rls','h','E','owner')",
          [tenantB]
        )
      )
    ).rejects.toThrow(); // RLS WITH CHECK violation
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `pnpm --filter @app/api test rls-isolation`
Expected: PASS — 4 tests. If the INSERT test does not throw, the RLS policy in migration 002 is missing a `with check` clause — fix the migration to add `with check (tenant_id = current_setting('app.current_tenant_id', true)::uuid)` and re-run.

- [ ] **Step 3: Fix migration 002 if needed**

If Step 2 revealed a missing `with check`, update `db/migrations/002_users_rls.sql` policy to:

```sql
create policy users_tenant_isolation on users
  using (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

Then drop and recreate the dev DB (`docker compose down -v && docker compose up -d db && pnpm migrate`) and re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/rls-isolation.test.ts db/migrations/002_users_rls.sql
git commit -m "test: add RLS tenant isolation suite"
```

### Task 22: API Dockerfile

**Files:**
- Create: `apps/api/Dockerfile`

- [ ] **Step 1: Create `apps/api/Dockerfile`**

```dockerfile
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @app/api build

CMD ["node", "apps/api/dist/index.js"]
```

- [ ] **Step 2: Build the image**

Run: `docker compose build api`
Expected: build succeeds.

- [ ] **Step 3: Boot the full stack and hit health**

Run: `docker compose --profile dev up -d && sleep 5 && curl -s localhost:4000/health`
Expected: `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/Dockerfile
git commit -m "chore: add api dockerfile"
```

### Task 23: Next.js scaffold + Tailwind neo-brutalism preset

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.js`, `apps/web/tsconfig.json`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.js`, `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `packages/ui/package.json`, `packages/ui/src/tailwind-preset.ts`

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@app/ui",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run" },
  "peerDependencies": { "react": "^18.3.0" },
  "devDependencies": {
    "react": "^18.3.0",
    "@types/react": "^18.3.0",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/ui/src/tailwind-preset.ts`**

This is the single source of truth for the design system tokens.

```ts
import type { Config } from "tailwindcss";

export const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        bg: "#f5f5f5",
        fg: "#222222",
        card: "#ffffff",
        primary: "#f6b233",
        secondary: "#5bc0be",
        accent: "#ff6b6b",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      borderRadius: { sm: "0.25rem", md: "0.5rem", lg: "0.75rem" },
      boxShadow: {
        "brutal-sm": "2px 2px 0 #222222",
        brutal: "4px 4px 0 #222222",
        "brutal-lg": "8px 8px 0 #222222",
        "brutal-btn-hover": "5px 5px 0 #222222",
      },
      transitionTimingFunction: { brutal: "ease" },
    },
  },
};
```

- [ ] **Step 3: Create `apps/web/package.json`**

```json
{
  "name": "@app/web",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@tanstack/react-query": "^5.59.0",
    "react-hook-form": "^7.53.0",
    "@hookform/resolvers": "^3.9.0",
    "framer-motion": "^11.11.0",
    "zod": "^3.23.0",
    "@app/shared": "workspace:*",
    "@app/ui": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^18.3.0",
    "@types/node": "^22.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Create config files**

`apps/web/next.config.js`:
```js
/** @type {import('next').NextConfig} */
module.exports = { transpilePackages: ["@app/ui", "@app/shared"] };
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["dom", "es2022"],
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "next-env.d.ts", ".next/types/**/*.ts"]
}
```

`apps/web/postcss.config.js`:
```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`apps/web/tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
import { preset } from "@app/ui/src/tailwind-preset";

export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  presets: [preset as Config],
} satisfies Config;
```

- [ ] **Step 5: Create `apps/web/src/app/globals.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700;900&family=Inter:wght@400;500;600&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

body { background: #f5f5f5; color: #222222; font-family: Inter, sans-serif; }
h1, h2, h3, h4, button, label { font-family: 'Space Grotesk', sans-serif; }
```

- [ ] **Step 6: Create `apps/web/src/app/layout.tsx`**

```tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Operational Web App" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create `apps/web/src/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="border-2 border-fg bg-card shadow-brutal rounded-lg px-8 py-6">
        <h1 className="text-3xl font-black">Operational Web App</h1>
        <p className="mt-2 text-fg/70">Go to /admin/login or /t/&lt;slug&gt;/login</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Install and run dev server**

Run: `pnpm install && pnpm --filter @app/web dev`
Expected: Next.js boots; `localhost:3000` shows the card with the hard shadow and black border.

- [ ] **Step 9: Commit**

```bash
git add apps/web packages/ui/package.json packages/ui/src/tailwind-preset.ts pnpm-lock.yaml
git commit -m "feat: scaffold next.js app with neo-brutalism tailwind preset"
```

### Task 24: Neo-brutalism UI component library

All components share the 3-layer mechanic: 2px black border, hard offset shadow, hover-lift. Each is small and presentational.

**Files:**
- Create: `packages/ui/src/{Button,Card,Badge,Chip,IconTile,LogoChip,Input,Select,Table,Modal,Toast,Navbar}.tsx`, `packages/ui/src/index.ts`, `packages/ui/vitest.config.ts`
- Test: `packages/ui/src/Button.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/Button.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its label and applies the variant fill", () => {
    render(<Button variant="primary">Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className).toContain("bg-primary");
    expect(btn.className).toContain("border-2");
  });
});
```

`packages/ui/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "jsdom" } });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/ui test`
Expected: FAIL — cannot find module `./Button`.

- [ ] **Step 3: Create `packages/ui/src/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "accent" | "white";
const fills: Record<Variant, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  accent: "bg-accent",
  white: "bg-card",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
}

export function Button({ variant = "primary", icon, children, className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={
        `inline-flex items-center gap-2 font-display font-bold text-fg ` +
        `border-2 border-fg rounded-md ${fills[variant]} px-4 py-2 shadow-brutal ` +
        `transition-all duration-150 ease-brutal ` +
        `hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-brutal-btn-hover ` +
        `disabled:opacity-50 disabled:pointer-events-none ${className}`
      }
    >
      {icon}
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Create the remaining components**

`packages/ui/src/Card.tsx`:
```tsx
import type { HTMLAttributes } from "react";
interface Props extends HTMLAttributes<HTMLDivElement> { hover?: boolean }
export function Card({ hover = false, className = "", ...rest }: Props) {
  return (
    <div
      {...rest}
      className={
        `bg-card border-2 border-fg rounded-lg shadow-brutal p-5 ` +
        (hover
          ? `transition-all duration-150 ease-brutal hover:-translate-x-1 hover:-translate-y-1 hover:shadow-brutal-lg `
          : ``) +
        className
      }
    />
  );
}
```

`packages/ui/src/Badge.tsx`:
```tsx
import type { HTMLAttributes } from "react";
type Tone = "primary" | "secondary" | "accent" | "soft";
const tones: Record<Tone, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  accent: "bg-accent",
  soft: "bg-primary/20",
};
interface Props extends HTMLAttributes<HTMLSpanElement> { tone?: Tone }
export function Badge({ tone = "primary", className = "", ...rest }: Props) {
  return (
    <span
      {...rest}
      className={`inline-block text-xs font-display font-bold text-fg border-2 border-fg rounded-full px-2.5 py-0.5 shadow-brutal-sm ${tones[tone]} ${className}`}
    />
  );
}
```

`packages/ui/src/Chip.tsx`:
```tsx
import type { HTMLAttributes } from "react";
export function Chip({ className = "", ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={`inline-block text-[10px] font-display font-bold text-fg border-2 border-fg rounded bg-card px-1.5 py-0.5 ${className}`}
    />
  );
}
```

`packages/ui/src/IconTile.tsx`:
```tsx
import type { ReactNode } from "react";
type Tone = "primary" | "secondary" | "accent";
const tones: Record<Tone, string> = { primary: "bg-primary", secondary: "bg-secondary", accent: "bg-accent" };
export function IconTile({ tone = "primary", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={`flex h-12 w-12 items-center justify-center border-2 border-fg rounded-md shadow-brutal-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
```

`packages/ui/src/LogoChip.tsx`:
```tsx
export function LogoChip({ initials }: { initials: string }) {
  return (
    <div className="flex h-8 w-8 items-center justify-center bg-primary border-2 border-fg rounded font-display font-black text-sm text-fg">
      {initials}
    </div>
  );
}
```

`packages/ui/src/Input.tsx`:
```tsx
import { forwardRef, type InputHTMLAttributes } from "react";
interface Props extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string }
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, className = "", ...rest }, ref
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block font-display font-bold text-sm">{label}</span>}
      <input
        ref={ref}
        {...rest}
        className={`w-full border-2 border-fg rounded-md bg-card px-3 py-2 shadow-brutal-sm focus:outline-none focus:-translate-y-[1px] ${className}`}
      />
      {error && <span className="mt-1 block text-xs text-accent font-bold">{error}</span>}
    </label>
  );
});
```

`packages/ui/src/Select.tsx`:
```tsx
import { forwardRef, type SelectHTMLAttributes } from "react";
interface Props extends SelectHTMLAttributes<HTMLSelectElement> { label?: string; error?: string }
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, error, className = "", children, ...rest }, ref
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block font-display font-bold text-sm">{label}</span>}
      <select
        ref={ref}
        {...rest}
        className={`w-full border-2 border-fg rounded-md bg-card px-3 py-2 shadow-brutal-sm focus:outline-none ${className}`}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-xs text-accent font-bold">{error}</span>}
    </label>
  );
});
```

`packages/ui/src/Table.tsx`:
```tsx
import type { ReactNode } from "react";
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="border-2 border-fg rounded-lg shadow-brutal bg-card overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-primary/20 border-b-2 border-fg font-display font-bold">{head}</thead>
        <tbody className="divide-y-2 divide-fg/20">{children}</tbody>
      </table>
    </div>
  );
}
```

`packages/ui/src/Modal.tsx`:
```tsx
import type { ReactNode } from "react";
export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40" onClick={onClose}>
      <div
        className="bg-card border-2 border-fg rounded-lg shadow-brutal-lg p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-display font-black mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}
```

`packages/ui/src/Toast.tsx`:
```tsx
type Tone = "primary" | "secondary" | "accent";
const tones: Record<Tone, string> = { primary: "bg-primary", secondary: "bg-secondary", accent: "bg-accent" };
export function Toast({ tone = "primary", message }: { tone?: Tone; message: string }) {
  return (
    <div className={`fixed bottom-4 right-4 z-50 border-2 border-fg rounded-md shadow-brutal px-4 py-2 font-display font-bold ${tones[tone]}`}>
      {message}
    </div>
  );
}
```

`packages/ui/src/Navbar.tsx`:
```tsx
import type { ReactNode } from "react";
import { LogoChip } from "./LogoChip";
export function Navbar({ initials, title, right }: { initials: string; title: string; right?: ReactNode }) {
  return (
    <nav className="flex items-center justify-between border-b-2 border-fg bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <LogoChip initials={initials} />
        <span className="font-display font-black text-lg">{title}</span>
      </div>
      {right}
    </nav>
  );
}
```

- [ ] **Step 5: Create `packages/ui/src/index.ts`**

```ts
export { Button } from "./Button";
export { Card } from "./Card";
export { Badge } from "./Badge";
export { Chip } from "./Chip";
export { IconTile } from "./IconTile";
export { LogoChip } from "./LogoChip";
export { Input } from "./Input";
export { Select } from "./Select";
export { Table } from "./Table";
export { Modal } from "./Modal";
export { Toast } from "./Toast";
export { Navbar } from "./Navbar";
export { preset } from "./tailwind-preset";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/ui test`
Expected: PASS — 1 test.

- [ ] **Step 7: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat: add neo-brutalism ui component library"
```

### Task 25: Web API client + auth helpers

A typed `fetch` wrapper that attaches the access token, transparently refreshes on 401, and surfaces the uniform error shape. Plus token storage and a React Query provider.

**Files:**
- Create: `apps/web/src/lib/auth.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/providers.tsx`
- Test: `apps/web/src/lib/api.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, apiFetch } from "./api";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ));
    const data = await apiFetch<{ ok: boolean }>("/health");
    expect(data.ok).toBe(true);
  });

  it("throws ApiError carrying the uniform error shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "not_found", message: "Nope" } }), { status: 404 })
    ));
    await expect(apiFetch("/missing")).rejects.toMatchObject({ code: "not_found", message: "Nope" });
    await expect(apiFetch("/missing")).rejects.toBeInstanceOf(ApiError);
  });
});
```

> Note: configure web vitest with `environment: "jsdom"` — add `apps/web/vitest.config.ts` mirroring the ui package's config.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/web test api`
Expected: FAIL — cannot find module `./api`.

- [ ] **Step 3: Create `apps/web/src/lib/auth.ts`**

```ts
export interface Session {
  accessToken: string;
  refreshToken: string;
  role: string;
  tenantId: string | null;
}

const KEY = "owa.session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function setSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 4: Create `apps/web/src/lib/api.ts`**

```ts
import { getSession, setSession, clearSession } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

async function refreshTokens(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }
  const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
  setSession({ ...session, ...tokens });
  return true;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, _retry = false): Promise<T> {
  const session = getSession();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (session) headers.set("authorization", `Bearer ${session.accessToken}`);

  const res = await fetch(`${BASE}${path.startsWith("/api") ? path : `/api/v1${path}`}`, { ...init, headers });

  if (res.status === 401 && !_retry && session) {
    if (await refreshTokens()) return apiFetch<T>(path, init, true);
  }

  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    const e = body?.error ?? { code: "unknown", message: "Request failed" };
    throw new ApiError(e.code, e.message, res.status, e.details);
  }
  return body as T;
}
```

- [ ] **Step 5: Create `apps/web/src/lib/providers.tsx`**

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Then wrap `apps/web/src/app/layout.tsx`'s `{children}` with `<Providers>`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/web test api`
Expected: PASS — 2 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib apps/web/vitest.config.ts apps/web/src/app/layout.tsx
git commit -m "feat: add web api client with token refresh"
```

### Task 26: Auth pages

Super-admin login (`/admin/login`) and tenant login (`/t/[slug]/login`). Both use react-hook-form + zod and the UI components.

**Files:**
- Create: `apps/web/src/app/(auth)/admin/login/page.tsx`, `apps/web/src/app/(auth)/t/[slug]/login/page.tsx`
- Create: `apps/web/src/components/LoginForm.tsx`

- [ ] **Step 1: Create `apps/web/src/components/LoginForm.tsx`**

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@app/shared";
import { Button, Card, Input } from "@app/ui";
import { apiFetch, ApiError } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  mode: "admin" | "tenant";
  slug?: string;
}

export function LoginForm({ mode, slug }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    try {
      const path = mode === "admin" ? "/auth/admin-login" : "/auth/tenant-login";
      const payload = mode === "admin" ? values : { ...values, slug };
      const res = await apiFetch<{
        accessToken: string; refreshToken: string;
        user?: { role: string; tenantId: string }; admin?: { id: string };
      }>(path, { method: "POST", body: JSON.stringify(payload) });
      setSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        role: res.user?.role ?? "platform_admin",
        tenantId: res.user?.tenantId ?? null,
      });
      router.push(mode === "admin" ? "/admin" : `/t/${slug}`);
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : "Login failed");
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <h1 className="text-2xl font-black mb-4">
        {mode === "admin" ? "Platform Admin" : "Sign in"}
      </h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input label="Email" type="email" {...register("email")} error={errors.email?.message} />
        <Input label="Password" type="password" {...register("password")} error={errors.password?.message} />
        {serverError && <p className="text-accent text-sm font-bold">{serverError}</p>}
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/app/(auth)/admin/login/page.tsx`**

```tsx
import { LoginForm } from "@/components/LoginForm";
export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm mode="admin" />
    </main>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/app/(auth)/t/[slug]/login/page.tsx`**

```tsx
import { LoginForm } from "@/components/LoginForm";
export default function TenantLoginPage({ params }: { params: { slug: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm mode="tenant" slug={params.slug} />
    </main>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `docker compose --profile dev up -d` then visit `localhost:3000/admin/login`.
Expected: the login card renders with neo-brutalism styling. (A working login needs a seeded platform admin — see Task 28's verification.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/LoginForm.tsx "apps/web/src/app/(auth)"
git commit -m "feat: add admin and tenant login pages"
```

### Task 27: Super-admin shell + tenants list

**Files:**
- Create: `apps/web/src/app/admin/layout.tsx`, `apps/web/src/app/admin/tenants/page.tsx`
- Create: `apps/web/src/components/RequireRole.tsx`

- [ ] **Step 1: Create `apps/web/src/components/RequireRole.tsx`**

```tsx
"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export function RequireRole({ role, redirect, children }: {
  role: string; redirect: string; children: ReactNode;
}) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== role) router.replace(redirect);
    else setOk(true);
  }, [role, redirect, router]);
  return ok ? <>{children}</> : null;
}
```

- [ ] **Step 2: Create `apps/web/src/app/admin/layout.tsx`**

```tsx
"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Navbar, Button } from "@app/ui";
import { RequireRole } from "@/components/RequireRole";
import { clearSession } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <RequireRole role="platform_admin" redirect="/admin/login">
      <Navbar
        initials="OP"
        title="Operational · Admin"
        right={
          <Button variant="white" onClick={() => { clearSession(); router.push("/admin/login"); }}>
            Log out
          </Button>
        }
      />
      <div className="flex">
        <aside className="w-52 border-r-2 border-fg min-h-[calc(100vh-57px)] p-4 space-y-2 bg-card">
          <Link href="/admin" className="block font-display font-bold">Dashboard</Link>
          <Link href="/admin/tenants" className="block font-display font-bold">Tenants</Link>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </RequireRole>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/app/admin/tenants/page.tsx`**

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button, Table, Badge } from "@app/ui";
import { apiFetch } from "@/lib/api";

interface Tenant {
  id: string; name: string; slug: string; sector: string; status: string;
}

export default function TenantsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => apiFetch<Tenant[]>("/admin/tenants"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-3xl font-black">Tenants</h1>
        <Link href="/admin/tenants/new">
          <Button variant="primary">+ Register tenant</Button>
        </Link>
      </div>
      {isLoading ? (
        <p className="text-fg/70">Loading…</p>
      ) : (
        <Table head={<tr><th className="p-3">Name</th><th className="p-3">Slug</th><th className="p-3">Sector</th><th className="p-3">Status</th></tr>}>
          {(data ?? []).map((t) => (
            <tr key={t.id}>
              <td className="p-3 font-bold">
                <Link href={`/admin/tenants/${t.id}`}>{t.name}</Link>
              </td>
              <td className="p-3">{t.slug}</td>
              <td className="p-3">{t.sector}</td>
              <td className="p-3">
                <Badge tone={t.status === "active" ? "secondary" : "accent"}>{t.status}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: stack up, log in as a platform admin (seed one — Task 28 Step 4), visit `/admin/tenants`.
Expected: empty table with the "Register tenant" button.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/layout.tsx apps/web/src/app/admin/tenants/page.tsx apps/web/src/components/RequireRole.tsx
git commit -m "feat: add super-admin shell and tenants list"
```

### Task 28: Register tenant + tenant detail pages + admin seed script

**Files:**
- Create: `apps/web/src/app/admin/tenants/new/page.tsx`, `apps/web/src/app/admin/tenants/[id]/page.tsx`
- Create: `db/seeds/seed-admin.ts` (CLI to create a platform admin)

- [ ] **Step 1: Create `db/seeds/seed-admin.ts`**

```ts
import { Pool } from "pg";
import argon2 from "argon2";

const [, , email, password, name] = process.argv;
if (!email || !password) {
  console.error("usage: tsx db/seeds/seed-admin.ts <email> <password> [name]");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
const hash = await argon2.hash(password);
await pool.query(
  `insert into platform_admins(email, password_hash, name) values ($1,$2,$3)
   on conflict (email) do update set password_hash = excluded.password_hash`,
  [email, hash, name ?? "Platform Admin"]
);
console.log(`platform admin ready: ${email}`);
await pool.end();
```

Add a root `package.json` script: `"seed:admin": "tsx db/seeds/seed-admin.ts"`.

- [ ] **Step 2: Create `apps/web/src/app/admin/tenants/new/page.tsx`**

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerTenantSchema, type RegisterTenantInput } from "@app/shared";
import { Button, Card, Input, Select } from "@app/ui";
import { apiFetch, ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

const SECTORS = ["grosir", "retail", "fnb", "jasa", "apotek"] as const;

export default function NewTenantPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<RegisterTenantInput>({ resolver: zodResolver(registerTenantSchema) });

  async function onSubmit(values: RegisterTenantInput) {
    setServerError(null);
    try {
      const t = await apiFetch<{ id: string }>("/admin/tenants", {
        method: "POST", body: JSON.stringify(values),
      });
      router.push(`/admin/tenants/${t.id}`);
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : "Failed to register tenant");
    }
  }

  return (
    <Card className="max-w-md">
      <h1 className="text-3xl font-black mb-4">Register tenant</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input label="Company name" {...register("name")} error={errors.name?.message} />
        <Input label="Slug" {...register("slug")} error={errors.slug?.message} />
        <Select label="Sector" {...register("sector")} error={errors.sector?.message}>
          {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Input label="Owner email" type="email" {...register("ownerEmail")} error={errors.ownerEmail?.message} />
        <Input label="Owner password" type="password" {...register("ownerPassword")} error={errors.ownerPassword?.message} />
        {serverError && <p className="text-accent text-sm font-bold">{serverError}</p>}
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create tenant"}
        </Button>
      </form>
    </Card>
  );
}
```

- [ ] **Step 3: Create `apps/web/src/app/admin/tenants/[id]/page.tsx`**

```tsx
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Badge, Table } from "@app/ui";
import { apiFetch } from "@/lib/api";

interface TenantDetail {
  id: string; name: string; slug: string; sector: string; status: string;
  users: { id: string; email: string; name: string; role: string; status: string }[];
}

export default function TenantDetailPage({ params }: { params: { id: string } }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["tenant", params.id],
    queryFn: () => apiFetch<TenantDetail>(`/admin/tenants/${params.id}`),
  });
  const mutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`/admin/tenants/${params.id}/status`, {
        method: "PATCH", body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", params.id] }),
  });

  if (!data) return <p className="text-fg/70">Loading…</p>;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">{data.name}</h1>
            <p className="text-fg/70">{data.slug} · {data.sector}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={data.status === "active" ? "secondary" : "accent"}>{data.status}</Badge>
            <Button
              variant={data.status === "active" ? "accent" : "secondary"}
              onClick={() => mutation.mutate(data.status === "active" ? "suspended" : "active")}
            >
              {data.status === "active" ? "Suspend" : "Activate"}
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-black mb-3">Users</h2>
        <Table head={<tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th></tr>}>
          {data.users.map((u) => (
            <tr key={u.id}>
              <td className="p-3 font-bold">{u.name}</td>
              <td className="p-3">{u.email}</td>
              <td className="p-3">{u.role}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: End-to-end manual verification**

```bash
docker compose --profile dev up -d && pnpm migrate
pnpm seed:admin admin@local admin123 "Local Admin"
```
Then: visit `/admin/login`, sign in with `admin@local` / `admin123`, register a tenant with sector `grosir`, confirm it appears in the list and the detail page shows the owner user. Check Mailhog at `localhost:8025` for the welcome email (requires Phase 2 migration for provisioning to fully succeed; the email step still fires).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/tenants/new apps/web/src/app/admin/tenants/[id] db/seeds/seed-admin.ts package.json
git commit -m "feat: add register tenant and tenant detail pages with admin seed"
```

### Task 29: Platform dashboard

**Files:**
- Create: `apps/web/src/app/admin/page.tsx`
- Create: `apps/api/src/routes/admin.routes.ts` — add a `GET /stats` endpoint
- Modify: `apps/api/src/services/tenant.service.ts` — add `platformStats()`
- Test: `apps/api/src/services/tenant.service.test.ts` — add a stats test

- [ ] **Step 1: Add the failing test**

Append to `apps/api/src/services/tenant.service.test.ts`:

```ts
import { platformStats } from "./tenant.service";

describe("platformStats", () => {
  it("returns total tenants and a per-sector breakdown", async () => {
    const stats = await platformStats();
    expect(stats.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(stats.bySector)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test tenant.service`
Expected: FAIL — `platformStats` is not exported.

- [ ] **Step 3: Add `platformStats` to `apps/api/src/services/tenant.service.ts`**

```ts
export async function platformStats() {
  return withAdmin(async (q) => {
    const total = (await q<{ n: number }>("select count(*)::int n from tenants")).rows[0].n;
    const bySector = (await q<{ sector: string; n: number }>(
      "select sector, count(*)::int n from tenants group by sector order by n desc"
    )).rows;
    const recent = (await q(
      "select id, name, slug, sector, created_at from tenants order by created_at desc limit 5"
    )).rows;
    return { total, bySector, recent };
  });
}
```

- [ ] **Step 4: Add the `/stats` endpoint to `apps/api/src/routes/admin.routes.ts`**

```ts
import { platformStats } from "../services/tenant.service";

adminRoutes.get("/stats", async (c) => c.json(await platformStats()));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/api test tenant.service`
Expected: PASS — all tenant.service tests including stats.

- [ ] **Step 6: Create `apps/web/src/app/admin/page.tsx`**

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { Card, Badge } from "@app/ui";
import { apiFetch } from "@/lib/api";

interface Stats {
  total: number;
  bySector: { sector: string; n: number }[];
  recent: { id: string; name: string; sector: string }[];
}

export default function AdminDashboard() {
  const { data } = useQuery({ queryKey: ["stats"], queryFn: () => apiFetch<Stats>("/admin/stats") });
  if (!data) return <p className="text-fg/70">Loading…</p>;
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card hover>
          <p className="text-fg/70 font-bold">Total tenants</p>
          <p className="text-5xl font-black">{data.total}</p>
        </Card>
        <Card hover>
          <p className="text-fg/70 font-bold mb-2">By sector</p>
          <div className="flex flex-wrap gap-2">
            {data.bySector.map((s) => (
              <Badge key={s.sector} tone="soft">{s.sector}: {s.n}</Badge>
            ))}
          </div>
        </Card>
        <Card hover>
          <p className="text-fg/70 font-bold mb-2">Recent</p>
          <ul className="space-y-1">
            {data.recent.map((r) => (
              <li key={r.id} className="font-bold">✦ {r.name}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/admin/page.tsx apps/api/src/routes/admin.routes.ts apps/api/src/services/tenant.service.ts apps/api/src/services/tenant.service.test.ts
git commit -m "feat: add platform dashboard with stats"
```

### Task 30: Tenant shell + coming-soon dashboard

The tenant shell wraps `/t/[slug]/*`. In Phase 1, the dashboard is a "module coming soon" card for every sector. Phase 2 replaces the grosir branch with the real module.

**Files:**
- Create: `apps/web/src/app/t/[slug]/layout.tsx`, `apps/web/src/app/t/[slug]/page.tsx`
- Create: `apps/web/src/lib/tenant.ts` — fetches `/t/:tenantId/me`

- [ ] **Step 1: Create `apps/web/src/lib/tenant.ts`**

```ts
import { apiFetch } from "./api";
import { getSession } from "./auth";

export interface TenantContext {
  userId: string; tenantId: string; role: string; sector: string;
}

export function fetchTenantContext(): Promise<TenantContext> {
  const session = getSession();
  if (!session?.tenantId) throw new Error("no tenant session");
  return apiFetch<TenantContext>(`/t/${session.tenantId}/me`);
}
```

- [ ] **Step 2: Create `apps/web/src/app/t/[slug]/layout.tsx`**

```tsx
"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Navbar, Button } from "@app/ui";
import { RequireRole } from "@/components/RequireRole";
import { clearSession, getSession } from "@/lib/auth";
import { fetchTenantContext } from "@/lib/tenant";
import { useRouter } from "next/navigation";

export default function TenantLayout({
  children, params,
}: { children: ReactNode; params: { slug: string } }) {
  const router = useRouter();
  const role = getSession()?.role ?? "";
  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });

  return (
    <RequireRole role={role || "owner"} redirect={`/t/${params.slug}/login`}>
      <Navbar
        initials={params.slug.slice(0, 2).toUpperCase()}
        title={`Operational · ${params.slug}`}
        right={
          <Button variant="white" onClick={() => { clearSession(); router.push(`/t/${params.slug}/login`); }}>
            Log out
          </Button>
        }
      />
      <div className="flex">
        <aside className="w-52 border-r-2 border-fg min-h-[calc(100vh-57px)] p-4 space-y-2 bg-card">
          <Link href={`/t/${params.slug}`} className="block font-display font-bold">Dashboard</Link>
          {/* grosir module links injected in Phase 2 */}
        </aside>
        <main className="flex-1 p-6" data-sector={ctx?.sector}>{children}</main>
      </div>
    </RequireRole>
  );
}
```

> Note: `RequireRole` here accepts any of the three tenant roles. In Phase 2, replace the single-role check with a helper that allows `["owner","manager","cashier"]`. For Phase 1 keep it permissive: change `RequireRole` to accept `role: string | string[]` and check membership. Make that small change now.

- [ ] **Step 3: Update `RequireRole` to accept multiple roles**

`apps/web/src/components/RequireRole.tsx` — change the `role` prop and check:

```tsx
export function RequireRole({ role, redirect, children }: {
  role: string | string[]; redirect: string; children: ReactNode;
}) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const s = getSession();
    const allowed = Array.isArray(role) ? role : [role];
    if (!s || !allowed.includes(s.role)) router.replace(redirect);
    else setOk(true);
  }, [role, redirect, router]);
  return ok ? <>{children}</> : null;
}
```

Then in `apps/web/src/app/t/[slug]/layout.tsx` pass `role={["owner","manager","cashier"]}`.

- [ ] **Step 4: Create `apps/web/src/app/t/[slug]/page.tsx`**

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { Card, Badge } from "@app/ui";
import { fetchTenantContext } from "@/lib/tenant";

export default function TenantDashboard() {
  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });
  if (!ctx) return <p className="text-fg/70">Loading…</p>;

  if (ctx.sector !== "grosir") {
    return (
      <Card className="max-w-lg">
        <h1 className="text-3xl font-black mb-2">Module coming soon</h1>
        <p className="text-fg/70">
          The <Badge tone="soft">{ctx.sector}</Badge> module is not available yet.
        </p>
      </Card>
    );
  }
  // grosir dashboard rendered here in Phase 2 (Task 44)
  return <p className="text-fg/70">Grosir module loads here (Phase 2).</p>;
}
```

- [ ] **Step 5: Manual verification**

Register a `retail` tenant, log in as its owner, confirm the "Module coming soon" card.
Register a `grosir` tenant, log in, confirm the Phase 2 placeholder text.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/t apps/web/src/lib/tenant.ts apps/web/src/components/RequireRole.tsx
git commit -m "feat: add tenant shell and coming-soon dashboard"
```

### Task 31: Web Dockerfile

**Files:**
- Create: `apps/web/Dockerfile`

- [ ] **Step 1: Add `output: "standalone"` to `apps/web/next.config.js`**

```js
/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ["@app/ui", "@app/shared"],
  output: "standalone",
};
```

- [ ] **Step 2: Create `apps/web/Dockerfile`**

```dockerfile
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter @app/web build

FROM node:22-slim AS run
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 3: Build and boot the full stack**

Run: `docker compose --profile dev up --build -d && sleep 8 && curl -s localhost:3000`
Expected: HTML for the home page returns.

- [ ] **Step 4: Commit**

```bash
git add apps/web/Dockerfile apps/web/next.config.js
git commit -m "chore: add web dockerfile"
```

### Task 32: Phase 1 end-to-end tests (Playwright)

Two flows: platform admin logs in and registers a tenant; that tenant's owner logs in and sees the dashboard.

**Files:**
- Create: `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/tests/phase1.spec.ts`

- [ ] **Step 1: Create `e2e/package.json`**

```json
{
  "name": "@app/e2e",
  "private": true,
  "scripts": { "test": "playwright test" },
  "devDependencies": { "@playwright/test": "^1.48.0" }
}
```

- [ ] **Step 2: Create `e2e/playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:3000" },
  timeout: 30_000,
});
```

- [ ] **Step 3: Write `e2e/tests/phase1.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

const SLUG = `e2e-${Date.now()}`;

test("admin logs in and registers a tenant", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@local");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/tenants/new");
  await page.getByLabel("Company name").fill("E2E Toko");
  await page.getByLabel("Slug").fill(SLUG);
  await page.getByLabel("Sector").selectOption("grosir");
  await page.getByLabel("Owner email").fill(`owner@${SLUG}.com`);
  await page.getByLabel("Owner password").fill("secret12");
  await page.getByRole("button", { name: "Create tenant" }).click();
  await expect(page.getByText("E2E Toko")).toBeVisible();
});

test("tenant owner logs in and reaches the dashboard", async ({ page }) => {
  await page.goto(`/t/${SLUG}/login`);
  await page.getByLabel("Email").fill(`owner@${SLUG}.com`);
  await page.getByLabel("Password").fill("secret12");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${SLUG}$`));
});
```

> Note: the second test depends on the first running first (shared `SLUG`). Keep them in one file, serial. The admin `admin@local` must be seeded (`pnpm seed:admin admin@local admin123`).

- [ ] **Step 4: Run the e2e suite**

Run: `docker compose --profile dev up -d && pnpm migrate && pnpm seed:admin admin@local admin123 && pnpm --filter @app/e2e exec playwright install --with-deps chromium && pnpm --filter @app/e2e test`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add e2e pnpm-lock.yaml
git commit -m "test: add phase 1 playwright e2e"
```

### Task 32b: Platform audit log — endpoint + page

Spec §8 lists "Audit log — view of `platform_audit_log`" as part of the super-admin panel. Task 15 already writes audit rows; this task exposes them.

**Files:**
- Modify: `apps/api/src/services/tenant.service.ts` (add `listAuditLog`)
- Modify: `apps/api/src/routes/admin.routes.ts` (add `GET /audit-log`)
- Create: `apps/web/src/app/admin/audit-log/page.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx` (add sidebar link)
- Test: `apps/api/src/services/tenant.service.test.ts` (add an audit-log test)

- [ ] **Step 1: Add the failing test**

Append to `apps/api/src/services/tenant.service.test.ts`:

```ts
import { listAuditLog } from "./tenant.service";

describe("listAuditLog", () => {
  it("returns audit entries newest first", async () => {
    // createTenant in earlier tests already wrote 'tenant.create' rows
    const entries = await listAuditLog();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]).toHaveProperty("action");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test tenant.service`
Expected: FAIL — `listAuditLog` is not exported.

- [ ] **Step 3: Add `listAuditLog` to `apps/api/src/services/tenant.service.ts`**

```ts
export interface AuditEntry {
  id: string; admin_id: string | null; action: string;
  target: string | null; created_at: string;
}

export function listAuditLog(): Promise<AuditEntry[]> {
  return withAdmin(async (q) =>
    (await q<AuditEntry>(
      "select id, admin_id, action, target, created_at from platform_audit_log order by created_at desc limit 200"
    )).rows
  );
}
```

- [ ] **Step 4: Add the endpoint to `apps/api/src/routes/admin.routes.ts`**

```ts
import { listAuditLog } from "../services/tenant.service";

adminRoutes.get("/audit-log", async (c) => c.json(await listAuditLog()));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/api test tenant.service`
Expected: PASS — all tenant.service tests including the audit-log test.

- [ ] **Step 6: Create `apps/web/src/app/admin/audit-log/page.tsx`**

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { Table } from "@app/ui";
import { apiFetch } from "@/lib/api";

interface AuditEntry {
  id: string; admin_id: string | null; action: string; target: string | null; created_at: string;
}

export default function AuditLogPage() {
  const { data } = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => apiFetch<AuditEntry[]>("/admin/audit-log"),
  });
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Audit log</h1>
      <Table head={<tr><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Admin</th><th className="p-3">Waktu</th></tr>}>
        {(data ?? []).map((e) => (
          <tr key={e.id}>
            <td className="p-3 font-bold">{e.action}</td>
            <td className="p-3">{e.target}</td>
            <td className="p-3">{e.admin_id}</td>
            <td className="p-3">{new Date(e.created_at).toLocaleString("id-ID")}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
```

- [ ] **Step 7: Add the sidebar link in `apps/web/src/app/admin/layout.tsx`**

Add below the Tenants link:

```tsx
<Link href="/admin/audit-log" className="block font-display font-bold">Audit log</Link>
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/tenant.service.ts apps/api/src/routes/admin.routes.ts apps/web/src/app/admin/audit-log apps/web/src/app/admin/layout.tsx apps/api/src/services/tenant.service.test.ts
git commit -m "feat: add platform audit log endpoint and page"
```

**✅ Phase 1 complete** — multi-tenancy core ships: super-admin can register and manage tenants, users can log in, RLS is proven, every sector lands on a working dashboard (grosir gets its module in Phase 2).

---

## Phase 2 — Grosir vertical

### Task 33: Migration 003 — grosir tables

**Files:**
- Create: `db/migrations/003_grosir.sql`

- [ ] **Step 1: Create `db/migrations/003_grosir.sql`**

```sql
-- helper: apply tenant-isolation RLS to a table
create or replace function apply_tenant_rls(tbl regclass) returns void as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format(
    'create policy tenant_isolation on %s
       using (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)
       with check (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)', tbl);
  execute format('grant select, insert, update, delete on %s to app', tbl);
end $$ language plpgsql;

create table categories (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table units (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table suppliers (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  category_id uuid references categories(id),
  sku text not null,
  name text not null,
  base_unit_id uuid not null references units(id),
  bulk_unit_id uuid references units(id),
  bulk_conversion integer check (bulk_conversion is null or bulk_conversion > 1),
  buy_price bigint not null default 0,            -- integer rupiah, per base unit
  sell_price_eceran bigint not null default 0,    -- per base unit
  sell_price_grosir bigint not null default 0,    -- per bulk unit
  min_stock integer not null default 0,           -- base units
  stock_qty integer not null default 0,           -- cached, base units
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table stock_in (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  supplier_id uuid references suppliers(id),
  note text,
  total_cost bigint not null default 0,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table stock_in_items (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  stock_in_id uuid not null references stock_in(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  qty integer not null check (qty > 0),
  unit_cost bigint not null,
  subtotal bigint not null
);

create table sales (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  invoice_no text not null,
  customer_name text,
  total bigint not null,
  paid bigint not null,
  change bigint not null,
  payment_method text not null default 'cash',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_no)
);

create table sale_items (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_type text not null check (unit_type in ('eceran','grosir')),
  qty integer not null check (qty > 0),
  unit_price bigint not null,
  subtotal bigint not null
);

create table stock_adjustments (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id),
  qty_base integer not null,                       -- signed
  reason text not null check (reason in ('rusak','hilang','koreksi')),
  note text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table stock_movements (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id),
  type text not null check (type in ('in','sale','adjustment')),
  ref_id uuid not null,
  qty_base integer not null,                       -- signed
  balance_after integer not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table export_jobs (
  id uuid primary key default uuid_v7(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  file_path text,
  params jsonb not null default '{}',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

select apply_tenant_rls('categories');
select apply_tenant_rls('units');
select apply_tenant_rls('suppliers');
select apply_tenant_rls('products');
select apply_tenant_rls('stock_in');
select apply_tenant_rls('stock_in_items');
select apply_tenant_rls('sales');
select apply_tenant_rls('sale_items');
select apply_tenant_rls('stock_adjustments');
select apply_tenant_rls('stock_movements');
select apply_tenant_rls('notifications');
select apply_tenant_rls('export_jobs');

create index on products (tenant_id, is_active);
create index on stock_movements (tenant_id, product_id, created_at);
create index on sales (tenant_id, created_at);
create index on notifications (tenant_id, is_read);
```

- [ ] **Step 2: Run the migration**

Run: `pnpm migrate`
Expected: prints `applied 003_grosir.sql`.

- [ ] **Step 3: Verify RLS is on for the new tables**

Run:
```bash
docker compose exec db psql -U app -d operational -c \
  "select relname, relrowsecurity from pg_class where relname in ('products','sales','stock_movements');"
```
Expected: all three show `relrowsecurity = t`.

- [ ] **Step 4: Re-run the provisioning test**

Un-skip `provisioning.test.ts` (Task 18) if you skipped it, then:
Run: `pnpm --filter @app/api test provisioning`
Expected: PASS — categories and units are seeded.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/003_grosir.sql
git commit -m "feat: add grosir module tables migration"
```

### Task 34: Grosir module shell + registry registration

The grosir module exposes one Hono router mounted by the tenant router under `/api/v1/t/:tenantId/m`. The shell provides a `grosirRouter` that sub-routers attach to, and registers the module on import.

**Files:**
- Create: `apps/api/src/modules/grosir/index.ts`, `apps/api/src/modules/grosir/routes.ts`
- Modify: `apps/api/src/index.ts` (add `import "./modules/grosir";`)
- Test: `apps/api/src/modules/grosir/routes.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/grosir/routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getModule } from "../registry";
import "./index";

describe("grosir module registration", () => {
  it("registers itself in the module registry", () => {
    const mod = getModule("grosir");
    expect(mod).toBeDefined();
    expect(mod?.sector).toBe("grosir");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test grosir/routes`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/routes.ts`**

```ts
import { Hono } from "hono";
import type { JwtPayload, Sector } from "@app/shared";

/**
 * Base router for the grosir module. The tenant router (Task 20) already ran
 * auth + tenant-match + sector lookup, but BullMQ-style sub-fetch loses Hono's
 * context vars — so this router re-derives auth from the forwarded header.
 */
export const grosirRouter = new Hono<{
  Variables: { auth: JwtPayload; sector: Sector };
}>();

// Sub-routers are mounted here in later tasks:
// grosirRouter.route("/masterdata", masterdataRoutes);
// grosirRouter.route("/products", productsRoutes);
// grosirRouter.route("/stock-in", stockInRoutes);
// grosirRouter.route("/sales", salesRoutes);
// grosirRouter.route("/adjustments", adjustmentsRoutes);
// grosirRouter.route("/dashboard", dashboardRoutes);
// grosirRouter.route("/reports", reportsRoutes);
// grosirRouter.route("/notifications", notificationsRoutes);
```

> Implementation note: because `tenant.routes.ts` delegates via `mod.router.fetch(c.req.raw, ...)`, re-attach auth inside `grosirRouter` with a small middleware that re-verifies the bearer token (reuse `authMiddleware`). Add `grosirRouter.use("*", authMiddleware)` at the top of `routes.ts`. The tenant-match check already happened upstream; this just repopulates `c.get("auth")`. Import `authMiddleware` from `../../middleware/auth`.

- [ ] **Step 4: Create `apps/api/src/modules/grosir/index.ts`**

```ts
import { registerModule } from "../registry";
import { grosirRouter } from "./routes";

registerModule({ sector: "grosir", router: grosirRouter });

export { grosirRouter };
```

- [ ] **Step 5: Add the import to `apps/api/src/index.ts`**

Add near the other router imports:

```ts
import "./modules/grosir";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/api test grosir/routes`
Expected: PASS — 1 test.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/grosir/index.ts apps/api/src/modules/grosir/routes.ts apps/api/src/index.ts apps/api/src/modules/grosir/routes.test.ts
git commit -m "feat: add grosir module shell and registry registration"
```

### Task 35: Grosir zod schemas

**Files:**
- Create: `packages/shared/src/schemas/grosir.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/grosir.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/schemas/grosir.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { productSchema, saleSchema, stockInSchema, adjustmentSchema } from "./grosir";

describe("grosir schemas", () => {
  it("accepts a valid product", () => {
    expect(productSchema.parse({
      sku: "BRS-5", name: "Beras 5kg", baseUnitId: "u1",
      bulkUnitId: "u2", bulkConversion: 10,
      buyPrice: 60000, sellPriceEceran: 65000, sellPriceGrosir: 640000, minStock: 5,
    })).toBeTruthy();
  });
  it("rejects a product whose bulkConversion is 1", () => {
    expect(() => productSchema.parse({
      sku: "X", name: "X", baseUnitId: "u1", bulkConversion: 1,
      buyPrice: 1, sellPriceEceran: 1, sellPriceGrosir: 1, minStock: 0,
    })).toThrow();
  });
  it("rejects a sale with no items", () => {
    expect(() => saleSchema.parse({ items: [], paid: 0, paymentMethod: "cash" })).toThrow();
  });
  it("accepts a valid sale", () => {
    expect(saleSchema.parse({
      items: [{ productId: "p1", unitType: "eceran", qty: 2 }],
      paid: 130000, paymentMethod: "cash",
    })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/shared test grosir`
Expected: FAIL — cannot find module `./grosir`.

- [ ] **Step 3: Create `packages/shared/src/schemas/grosir.ts`**

```ts
import { z } from "zod";

const money = z.number().int().nonnegative();

export const categorySchema = z.object({ name: z.string().min(1) });
export const unitSchema = z.object({ name: z.string().min(1) });
export const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const productSchema = z
  .object({
    sku: z.string().min(1),
    name: z.string().min(1),
    categoryId: z.string().optional(),
    baseUnitId: z.string().min(1),
    bulkUnitId: z.string().optional(),
    bulkConversion: z.number().int().min(2).optional(),
    buyPrice: money,
    sellPriceEceran: money,
    sellPriceGrosir: money,
    minStock: z.number().int().nonnegative(),
  })
  .refine((p) => !p.bulkUnitId || !!p.bulkConversion, {
    message: "bulkConversion is required when bulkUnitId is set",
    path: ["bulkConversion"],
  });

export const stockInSchema = z.object({
  supplierId: z.string().optional(),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        unitId: z.string().min(1),
        qty: z.number().int().positive(),
        unitCost: money,
      })
    )
    .min(1),
});

export const saleSchema = z.object({
  customerName: z.string().optional(),
  paymentMethod: z.enum(["cash", "transfer", "qris"]).default("cash"),
  paid: money,
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        unitType: z.enum(["eceran", "grosir"]),
        qty: z.number().int().positive(),
      })
    )
    .min(1),
});

export const adjustmentSchema = z.object({
  productId: z.string().min(1),
  qtyBase: z.number().int().refine((n) => n !== 0, "qtyBase cannot be zero"),
  reason: z.enum(["rusak", "hilang", "koreksi"]),
  note: z.string().optional(),
});

export type ProductInput = z.infer<typeof productSchema>;
export type StockInInput = z.infer<typeof stockInSchema>;
export type SaleInput = z.infer<typeof saleSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
```

- [ ] **Step 4: Export from `packages/shared/src/index.ts`**

Add: `export * from "./schemas/grosir";`

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @app/shared test grosir`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/grosir.ts packages/shared/src/index.ts packages/shared/src/schemas/grosir.test.ts
git commit -m "feat: add grosir zod schemas"
```

### Task 36: Stock movement helper

`recordMovement` is the single chokepoint for all stock changes: it inserts a `stock_movements` row and updates `products.stock_qty`, returning the new balance. It must be called inside an existing `withTenant` transaction (it takes the `Query` function, not a pool).

**Files:**
- Create: `apps/api/src/modules/grosir/stock.ts`
- Test: `apps/api/src/modules/grosir/stock.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/grosir/stock.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { withTenant } from "../../db/withTenant";
import { recordMovement } from "./stock";
import { AppError } from "../../lib/errors";

let tenantId: string, productId: string;

beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('StockCo','stockco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
  const u = await adminPool.query(
    "insert into units(tenant_id,name) values ($1,'pcs') returning id", [tenantId]
  );
  const p = await adminPool.query(
    `insert into products(tenant_id,sku,name,base_unit_id,buy_price,sell_price_eceran,sell_price_grosir,min_stock,stock_qty)
     values ($1,'SKU1','P1',$2,100,150,1400,3,0) returning id`,
    [tenantId, u.rows[0].id]
  );
  productId = p.rows[0].id;
});

describe("recordMovement", () => {
  it("increments stock and returns the new balance", async () => {
    const balance = await withTenant(tenantId, (q) =>
      recordMovement(q, { productId, type: "in", refId: productId, qtyBase: 20 })
    );
    expect(balance).toBe(20);
    const row = await adminPool.query("select stock_qty from products where id=$1", [productId]);
    expect(row.rows[0].stock_qty).toBe(20);
  });

  it("decrements stock on a negative movement", async () => {
    const balance = await withTenant(tenantId, (q) =>
      recordMovement(q, { productId, type: "sale", refId: productId, qtyBase: -5 })
    );
    expect(balance).toBe(15);
  });

  it("rejects a movement that would drive stock negative", async () => {
    await expect(
      withTenant(tenantId, (q) =>
        recordMovement(q, { productId, type: "sale", refId: productId, qtyBase: -999 })
      )
    ).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test grosir/stock`
Expected: FAIL — cannot find module `./stock`.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/stock.ts`**

```ts
import type { Query } from "../../db/withTenant";
import { AppError } from "../../lib/errors";

export interface MovementInput {
  productId: string;
  type: "in" | "sale" | "adjustment";
  refId: string;
  qtyBase: number; // signed
}

/** Insert a stock movement and update the cached product balance. Returns the new balance. */
export async function recordMovement(q: Query, m: MovementInput): Promise<number> {
  // Lock the product row to serialise concurrent movements.
  const current = await q<{ stock_qty: number }>(
    "select stock_qty from products where id = $1 for update",
    [m.productId]
  );
  if (!current.rowCount) throw new AppError(404, "product_not_found", "Product not found");

  const balanceAfter = current.rows[0].stock_qty + m.qtyBase;
  if (balanceAfter < 0) {
    throw new AppError(409, "insufficient_stock", "Not enough stock for this movement");
  }

  await q(
    `insert into stock_movements (tenant_id, product_id, type, ref_id, qty_base, balance_after)
     values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4, $5)`,
    [m.productId, m.type, m.refId, m.qtyBase, balanceAfter]
  );
  await q("update products set stock_qty = $1 where id = $2", [balanceAfter, m.productId]);
  return balanceAfter;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/api test grosir/stock`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/grosir/stock.ts apps/api/src/modules/grosir/stock.test.ts
git commit -m "feat: add stock movement helper"
```

### Task 37: Master data — service + routes

CRUD for `categories`, `units`, `suppliers`. All three are thin tenant-scoped tables, handled by one service file and one router. Owner/Manager only.

**Files:**
- Create: `apps/api/src/modules/grosir/masterdata.service.ts`, `apps/api/src/modules/grosir/masterdata.routes.ts`
- Modify: `apps/api/src/modules/grosir/routes.ts` (mount sub-router)
- Test: `apps/api/src/modules/grosir/masterdata.service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/grosir/masterdata.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { listCategories, createCategory, listUnits, createUnit, createSupplier, listSuppliers } from "./masterdata.service";

let tenantId: string;
beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('MDCo','mdco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
});

describe("masterdata service", () => {
  it("creates and lists a category", async () => {
    await createCategory(tenantId, { name: "Beras" });
    const all = await listCategories(tenantId);
    expect(all.some((c) => c.name === "Beras")).toBe(true);
  });
  it("creates and lists a unit", async () => {
    await createUnit(tenantId, { name: "sak" });
    expect((await listUnits(tenantId)).some((u) => u.name === "sak")).toBe(true);
  });
  it("creates and lists a supplier", async () => {
    await createSupplier(tenantId, { name: "PT Sumber", phone: "0812" });
    expect((await listSuppliers(tenantId)).some((s) => s.name === "PT Sumber")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test masterdata.service`
Expected: FAIL — cannot find module `./masterdata.service`.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/masterdata.service.ts`**

```ts
import { withTenant } from "../../db/withTenant";
import type { z } from "zod";
import type { categorySchema, unitSchema, supplierSchema } from "@app/shared";

type CategoryInput = z.infer<typeof categorySchema>;
type UnitInput = z.infer<typeof unitSchema>;
type SupplierInput = z.infer<typeof supplierSchema>;

export interface NamedRow { id: string; name: string }
export interface SupplierRow { id: string; name: string; phone: string | null; address: string | null }

export function listCategories(tenantId: string): Promise<NamedRow[]> {
  return withTenant(tenantId, async (q) =>
    (await q<NamedRow>("select id, name from categories order by name")).rows
  );
}
export function createCategory(tenantId: string, input: CategoryInput): Promise<NamedRow> {
  return withTenant(tenantId, async (q) =>
    (await q<NamedRow>(
      "insert into categories(tenant_id,name) values (current_setting('app.current_tenant_id')::uuid,$1) returning id,name",
      [input.name]
    )).rows[0]
  );
}
export function listUnits(tenantId: string): Promise<NamedRow[]> {
  return withTenant(tenantId, async (q) =>
    (await q<NamedRow>("select id, name from units order by name")).rows
  );
}
export function createUnit(tenantId: string, input: UnitInput): Promise<NamedRow> {
  return withTenant(tenantId, async (q) =>
    (await q<NamedRow>(
      "insert into units(tenant_id,name) values (current_setting('app.current_tenant_id')::uuid,$1) returning id,name",
      [input.name]
    )).rows[0]
  );
}
export function listSuppliers(tenantId: string): Promise<SupplierRow[]> {
  return withTenant(tenantId, async (q) =>
    (await q<SupplierRow>("select id, name, phone, address from suppliers order by name")).rows
  );
}
export function createSupplier(tenantId: string, input: SupplierInput): Promise<SupplierRow> {
  return withTenant(tenantId, async (q) =>
    (await q<SupplierRow>(
      `insert into suppliers(tenant_id,name,phone,address)
       values (current_setting('app.current_tenant_id')::uuid,$1,$2,$3)
       returning id,name,phone,address`,
      [input.name, input.phone ?? null, input.address ?? null]
    )).rows[0]
  );
}
```

- [ ] **Step 4: Create `apps/api/src/modules/grosir/masterdata.routes.ts`**

```ts
import { Hono } from "hono";
import { categorySchema, unitSchema, supplierSchema, type JwtPayload } from "@app/shared";
import { requireRole } from "../../middleware/requireRole";
import {
  listCategories, createCategory, listUnits, createUnit, listSuppliers, createSupplier,
} from "./masterdata.service";

export const masterdataRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

masterdataRoutes.get("/categories", async (c) => c.json(await listCategories(c.get("auth").tenantId!)));
masterdataRoutes.post("/categories", requireRole("owner", "manager"), async (c) =>
  c.json(await createCategory(c.get("auth").tenantId!, categorySchema.parse(await c.req.json())), 201)
);
masterdataRoutes.get("/units", async (c) => c.json(await listUnits(c.get("auth").tenantId!)));
masterdataRoutes.post("/units", requireRole("owner", "manager"), async (c) =>
  c.json(await createUnit(c.get("auth").tenantId!, unitSchema.parse(await c.req.json())), 201)
);
masterdataRoutes.get("/suppliers", (c) => listSuppliers(c.get("auth").tenantId!).then((r) => c.json(r)));
masterdataRoutes.post("/suppliers", requireRole("owner", "manager"), async (c) =>
  c.json(await createSupplier(c.get("auth").tenantId!, supplierSchema.parse(await c.req.json())), 201)
);
```

- [ ] **Step 5: Mount in `apps/api/src/modules/grosir/routes.ts`**

Add the import and `grosirRouter.route("/masterdata", masterdataRoutes);`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/api test masterdata.service`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/grosir/masterdata.service.ts apps/api/src/modules/grosir/masterdata.routes.ts apps/api/src/modules/grosir/routes.ts apps/api/src/modules/grosir/masterdata.service.test.ts
git commit -m "feat: add grosir master data service and routes"
```

### Task 38: Products — service + routes

CRUD for products with pricing and unit conversion. Stock starts at 0 and only changes via movements. Owner/Manager write; Cashier read.

**Files:**
- Create: `apps/api/src/modules/grosir/products.service.ts`, `apps/api/src/modules/grosir/products.routes.ts`
- Modify: `apps/api/src/modules/grosir/routes.ts`
- Test: `apps/api/src/modules/grosir/products.service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/grosir/products.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { createProduct, listProducts, getProduct, updateProduct } from "./products.service";
import { AppError } from "../../lib/errors";

let tenantId: string, baseUnit: string, bulkUnit: string;
beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('PrdCo','prdco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
  baseUnit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'pcs') returning id", [tenantId])).rows[0].id;
  bulkUnit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'dus') returning id", [tenantId])).rows[0].id;
});

describe("products service", () => {
  it("creates a product with bulk pricing", async () => {
    const p = await createProduct(tenantId, {
      sku: "BRS-1", name: "Beras Premium", baseUnitId: baseUnit, bulkUnitId: bulkUnit,
      bulkConversion: 10, buyPrice: 12000, sellPriceEceran: 14000, sellPriceGrosir: 135000, minStock: 5,
    });
    expect(p.id).toBeTruthy();
    expect(p.stock_qty).toBe(0);
  });
  it("rejects a duplicate sku", async () => {
    await expect(createProduct(tenantId, {
      sku: "BRS-1", name: "Dup", baseUnitId: baseUnit, buyPrice: 1, sellPriceEceran: 1, sellPriceGrosir: 1, minStock: 0,
    })).rejects.toBeInstanceOf(AppError);
  });
  it("lists and updates a product", async () => {
    const list = await listProducts(tenantId, {});
    const p = list[0];
    const updated = await updateProduct(tenantId, p.id, { ...p, sellPriceEceran: 15000 } as never);
    expect(updated.sell_price_eceran).toBe(15000);
    const fetched = await getProduct(tenantId, p.id);
    expect(fetched.sell_price_eceran).toBe(15000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test products.service`
Expected: FAIL — cannot find module `./products.service`.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/products.service.ts`**

```ts
import { withTenant } from "../../db/withTenant";
import { AppError } from "../../lib/errors";
import type { ProductInput } from "@app/shared";

export interface ProductRow {
  id: string; sku: string; name: string; category_id: string | null;
  base_unit_id: string; bulk_unit_id: string | null; bulk_conversion: number | null;
  buy_price: number; sell_price_eceran: number; sell_price_grosir: number;
  min_stock: number; stock_qty: number; is_active: boolean;
}

const COLS = `id, sku, name, category_id, base_unit_id, bulk_unit_id, bulk_conversion,
  buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty, is_active`;

export function createProduct(tenantId: string, input: ProductInput): Promise<ProductRow> {
  return withTenant(tenantId, async (q) => {
    const dup = await q("select 1 from products where sku = $1", [input.sku]);
    if (dup.rowCount) throw new AppError(409, "sku_taken", "That SKU already exists");
    const r = await q<ProductRow>(
      `insert into products
        (tenant_id, sku, name, category_id, base_unit_id, bulk_unit_id, bulk_conversion,
         buy_price, sell_price_eceran, sell_price_grosir, min_stock)
       values (current_setting('app.current_tenant_id')::uuid,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning ${COLS}`,
      [input.sku, input.name, input.categoryId ?? null, input.baseUnitId,
       input.bulkUnitId ?? null, input.bulkConversion ?? null,
       input.buyPrice, input.sellPriceEceran, input.sellPriceGrosir, input.minStock]
    );
    return r.rows[0];
  });
}

export function listProducts(tenantId: string, filter: { search?: string; activeOnly?: boolean }): Promise<ProductRow[]> {
  return withTenant(tenantId, async (q) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.activeOnly) where.push("is_active = true");
    if (filter.search) { params.push(`%${filter.search}%`); where.push(`(name ilike $${params.length} or sku ilike $${params.length})`); }
    const sql = `select ${COLS} from products` +
      (where.length ? ` where ${where.join(" and ")}` : "") + ` order by name`;
    return (await q<ProductRow>(sql, params)).rows;
  });
}

export function getProduct(tenantId: string, id: string): Promise<ProductRow> {
  return withTenant(tenantId, async (q) => {
    const r = await q<ProductRow>(`select ${COLS} from products where id = $1`, [id]);
    if (!r.rowCount) throw new AppError(404, "not_found", "Product not found");
    return r.rows[0];
  });
}

export function updateProduct(tenantId: string, id: string, input: ProductInput): Promise<ProductRow> {
  return withTenant(tenantId, async (q) => {
    const r = await q<ProductRow>(
      `update products set
         name=$2, category_id=$3, base_unit_id=$4, bulk_unit_id=$5, bulk_conversion=$6,
         buy_price=$7, sell_price_eceran=$8, sell_price_grosir=$9, min_stock=$10
       where id=$1 returning ${COLS}`,
      [id, input.name, input.categoryId ?? null, input.baseUnitId,
       input.bulkUnitId ?? null, input.bulkConversion ?? null,
       input.buyPrice, input.sellPriceEceran, input.sellPriceGrosir, input.minStock]
    );
    if (!r.rowCount) throw new AppError(404, "not_found", "Product not found");
    return r.rows[0];
  });
}

export function setProductActive(tenantId: string, id: string, isActive: boolean): Promise<void> {
  return withTenant(tenantId, async (q) => {
    const r = await q("update products set is_active = $2 where id = $1", [id, isActive]);
    if (!r.rowCount) throw new AppError(404, "not_found", "Product not found");
  });
}
```

- [ ] **Step 4: Create `apps/api/src/modules/grosir/products.routes.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import { productSchema, type JwtPayload } from "@app/shared";
import { requireRole } from "../../middleware/requireRole";
import {
  createProduct, listProducts, getProduct, updateProduct, setProductActive,
} from "./products.service";

export const productsRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

productsRoutes.get("/", async (c) => {
  const tenantId = c.get("auth").tenantId!;
  return c.json(await listProducts(tenantId, {
    search: c.req.query("search") || undefined,
    activeOnly: c.req.query("activeOnly") === "true",
  }));
});
productsRoutes.get("/:id", async (c) =>
  c.json(await getProduct(c.get("auth").tenantId!, c.req.param("id")))
);
productsRoutes.post("/", requireRole("owner", "manager"), async (c) =>
  c.json(await createProduct(c.get("auth").tenantId!, productSchema.parse(await c.req.json())), 201)
);
productsRoutes.put("/:id", requireRole("owner", "manager"), async (c) =>
  c.json(await updateProduct(c.get("auth").tenantId!, c.req.param("id"), productSchema.parse(await c.req.json())))
);
productsRoutes.patch("/:id/active", requireRole("owner", "manager"), async (c) => {
  const { isActive } = z.object({ isActive: z.boolean() }).parse(await c.req.json());
  await setProductActive(c.get("auth").tenantId!, c.req.param("id"), isActive);
  return c.json({ ok: true });
});
```

- [ ] **Step 5: Mount in `apps/api/src/modules/grosir/routes.ts`**

Add `grosirRouter.route("/products", productsRoutes);`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/api test products.service`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/grosir/products.service.ts apps/api/src/modules/grosir/products.routes.ts apps/api/src/modules/grosir/routes.ts apps/api/src/modules/grosir/products.service.test.ts
git commit -m "feat: add grosir products service and routes"
```

### Task 39: Barang masuk (stock-in) — service + routes

Creates a `stock_in` header with line items, records one positive movement per item, increments stock — all in one transaction. Items are entered in any unit; qty is converted to base units using the product's `bulk_conversion`. Owner/Manager only.

**Files:**
- Create: `apps/api/src/modules/grosir/stockin.service.ts`, `apps/api/src/modules/grosir/stockin.routes.ts`
- Modify: `apps/api/src/modules/grosir/routes.ts`
- Test: `apps/api/src/modules/grosir/stockin.service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/grosir/stockin.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { createStockIn, listStockIn } from "./stockin.service";

let tenantId: string, userId: string, baseUnit: string, bulkUnit: string, productId: string;

beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('SInCo','sinco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
  userId = (await adminPool.query(
    "insert into users(tenant_id,email,password_hash,name,role) values ($1,'u@sinco','h','U','owner') returning id",
    [tenantId]
  )).rows[0].id;
  baseUnit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'pcs') returning id", [tenantId])).rows[0].id;
  bulkUnit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'dus') returning id", [tenantId])).rows[0].id;
  productId = (await adminPool.query(
    `insert into products(tenant_id,sku,name,base_unit_id,bulk_unit_id,bulk_conversion,
       buy_price,sell_price_eceran,sell_price_grosir,min_stock)
     values ($1,'P-SIN','Minyak',$2,$3,12,15000,17000,190000,6) returning id`,
    [tenantId, baseUnit, bulkUnit]
  )).rows[0].id;
});

describe("stock-in service", () => {
  it("adds stock and converts bulk units to base units", async () => {
    // 2 dus (bulk, conversion 12) + 5 pcs (base) = 24 + 5 = 29 base units
    const result = await createStockIn(tenantId, userId, {
      note: "first delivery",
      items: [
        { productId, unitId: bulkUnit, qty: 2, unitCost: 180000 },
        { productId, unitId: baseUnit, qty: 5, unitCost: 15000 },
      ],
    });
    expect(result.id).toBeTruthy();
    expect(result.total_cost).toBe(2 * 180000 + 5 * 15000);

    const p = await adminPool.query("select stock_qty from products where id=$1", [productId]);
    expect(p.rows[0].stock_qty).toBe(29);
  });

  it("lists stock-in records newest first", async () => {
    const list = await listStockIn(tenantId);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test stockin.service`
Expected: FAIL — cannot find module `./stockin.service`.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/stockin.service.ts`**

```ts
import { withTenant } from "../../db/withTenant";
import { AppError } from "../../lib/errors";
import { recordMovement } from "./stock";
import type { StockInInput } from "@app/shared";

export interface StockInRow {
  id: string; supplier_id: string | null; note: string | null;
  total_cost: number; created_at: string;
}

/** Resolve how many base units `qty` of `unitId` represents for a product. */
function toBaseQty(
  product: { base_unit_id: string; bulk_unit_id: string | null; bulk_conversion: number | null },
  unitId: string,
  qty: number
): number {
  if (unitId === product.base_unit_id) return qty;
  if (unitId === product.bulk_unit_id && product.bulk_conversion) return qty * product.bulk_conversion;
  throw new AppError(400, "bad_unit", "Unit does not match the product's base or bulk unit");
}

export function createStockIn(tenantId: string, userId: string, input: StockInInput): Promise<StockInRow> {
  return withTenant(tenantId, async (q) => {
    const totalCost = input.items.reduce((sum, it) => sum + it.qty * it.unitCost, 0);
    const header = await q<StockInRow>(
      `insert into stock_in(tenant_id, supplier_id, note, total_cost, created_by)
       values (current_setting('app.current_tenant_id')::uuid,$1,$2,$3,$4)
       returning id, supplier_id, note, total_cost, created_at`,
      [input.supplierId ?? null, input.note ?? null, totalCost, userId]
    );
    const stockInId = header.rows[0].id;

    for (const item of input.items) {
      const prod = await q<{ base_unit_id: string; bulk_unit_id: string | null; bulk_conversion: number | null }>(
        "select base_unit_id, bulk_unit_id, bulk_conversion from products where id = $1",
        [item.productId]
      );
      if (!prod.rowCount) throw new AppError(404, "product_not_found", "Product not found");
      const baseQty = toBaseQty(prod.rows[0], item.unitId, item.qty);

      await q(
        `insert into stock_in_items(tenant_id, stock_in_id, product_id, unit_id, qty, unit_cost, subtotal)
         values (current_setting('app.current_tenant_id')::uuid,$1,$2,$3,$4,$5,$6)`,
        [stockInId, item.productId, item.unitId, item.qty, item.unitCost, item.qty * item.unitCost]
      );
      await recordMovement(q, { productId: item.productId, type: "in", refId: stockInId, qtyBase: baseQty });
    }
    return header.rows[0];
  });
}

export function listStockIn(tenantId: string): Promise<StockInRow[]> {
  return withTenant(tenantId, async (q) =>
    (await q<StockInRow>(
      "select id, supplier_id, note, total_cost, created_at from stock_in order by created_at desc limit 100"
    )).rows
  );
}
```

- [ ] **Step 4: Create `apps/api/src/modules/grosir/stockin.routes.ts`**

```ts
import { Hono } from "hono";
import { stockInSchema, type JwtPayload } from "@app/shared";
import { requireRole } from "../../middleware/requireRole";
import { createStockIn, listStockIn } from "./stockin.service";

export const stockInRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

stockInRoutes.get("/", async (c) => c.json(await listStockIn(c.get("auth").tenantId!)));
stockInRoutes.post("/", requireRole("owner", "manager"), async (c) => {
  const auth = c.get("auth");
  return c.json(await createStockIn(auth.tenantId!, auth.sub, stockInSchema.parse(await c.req.json())), 201);
});
```

- [ ] **Step 5: Mount in `apps/api/src/modules/grosir/routes.ts`**

Add `grosirRouter.route("/stock-in", stockInRoutes);`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/api test stockin.service`
Expected: PASS — 2 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/grosir/stockin.service.ts apps/api/src/modules/grosir/stockin.routes.ts apps/api/src/modules/grosir/routes.ts apps/api/src/modules/grosir/stockin.service.test.ts
git commit -m "feat: add barang masuk (stock-in) service and routes"
```

### Task 40: Penjualan (POS) — service + routes

A sale records `barang keluar` and `pemasukan` together. For each line: `eceran` deducts `qty` base units priced at `sell_price_eceran`; `grosir` deducts `qty × bulk_conversion` base units priced at `sell_price_grosir`. One transaction: header + items + one negative movement per line + stock decrement. Invoice number is generated per tenant. All roles.

**Files:**
- Create: `apps/api/src/modules/grosir/sales.service.ts`, `apps/api/src/modules/grosir/sales.routes.ts`
- Modify: `apps/api/src/modules/grosir/routes.ts`
- Test: `apps/api/src/modules/grosir/sales.service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/grosir/sales.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { withTenant } from "../../db/withTenant";
import { recordMovement } from "./stock";
import { createSale, listSales } from "./sales.service";
import { AppError } from "../../lib/errors";

let tenantId: string, userId: string, baseUnit: string, bulkUnit: string, productId: string;

beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('PosCo','posco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
  userId = (await adminPool.query(
    "insert into users(tenant_id,email,password_hash,name,role) values ($1,'c@posco','h','C','cashier') returning id",
    [tenantId]
  )).rows[0].id;
  baseUnit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'pcs') returning id", [tenantId])).rows[0].id;
  bulkUnit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'dus') returning id", [tenantId])).rows[0].id;
  productId = (await adminPool.query(
    `insert into products(tenant_id,sku,name,base_unit_id,bulk_unit_id,bulk_conversion,
       buy_price,sell_price_eceran,sell_price_grosir,min_stock)
     values ($1,'P-POS','Gula',$2,$3,10,10000,12000,110000,5) returning id`,
    [tenantId, baseUnit, bulkUnit]
  )).rows[0].id;
  // seed 100 base units of stock
  await withTenant(tenantId, (q) =>
    recordMovement(q, { productId, type: "in", refId: productId, qtyBase: 100 })
  );
});

describe("sales service", () => {
  it("creates a sale, computes total, and decrements stock", async () => {
    // 1 dus (grosir, 10 base, 110000) + 3 pcs (eceran, 3 base, 12000 each = 36000)
    const sale = await createSale(tenantId, userId, {
      paymentMethod: "cash",
      paid: 200000,
      items: [
        { productId, unitType: "grosir", qty: 1 },
        { productId, unitType: "eceran", qty: 3 },
      ],
    });
    expect(sale.total).toBe(110000 + 36000);
    expect(sale.change).toBe(200000 - 146000);
    expect(sale.invoice_no).toMatch(/^INV-/);

    const p = await adminPool.query("select stock_qty from products where id=$1", [productId]);
    expect(p.rows[0].stock_qty).toBe(100 - 10 - 3); // 87
  });

  it("rejects a sale when paid is less than the total", async () => {
    await expect(createSale(tenantId, userId, {
      paymentMethod: "cash", paid: 100,
      items: [{ productId, unitType: "eceran", qty: 1 }],
    })).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a sale exceeding available stock", async () => {
    await expect(createSale(tenantId, userId, {
      paymentMethod: "cash", paid: 99999999,
      items: [{ productId, unitType: "grosir", qty: 999 }],
    })).rejects.toBeInstanceOf(AppError);
  });

  it("lists sales newest first", async () => {
    expect((await listSales(tenantId, {})).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test sales.service`
Expected: FAIL — cannot find module `./sales.service`.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/sales.service.ts`**

```ts
import { withTenant, type Query } from "../../db/withTenant";
import { AppError } from "../../lib/errors";
import { recordMovement } from "./stock";
import type { SaleInput } from "@app/shared";

export interface SaleRow {
  id: string; invoice_no: string; customer_name: string | null;
  total: number; paid: number; change: number; payment_method: string; created_at: string;
}

/** Per-tenant sequential invoice number: INV-YYYYMMDD-NNNN. */
async function nextInvoiceNo(q: Query): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `INV-${today}-`;
  const r = await q<{ invoice_no: string }>(
    "select invoice_no from sales where invoice_no like $1 order by invoice_no desc limit 1",
    [`${prefix}%`]
  );
  const seq = r.rowCount ? Number(r.rows[0].invoice_no.slice(prefix.length)) + 1 : 1;
  return prefix + String(seq).padStart(4, "0");
}

export function createSale(tenantId: string, userId: string, input: SaleInput): Promise<SaleRow> {
  return withTenant(tenantId, async (q) => {
    const lines: { productId: string; baseQty: number; unitPrice: number; subtotal: number; unitType: string }[] = [];

    for (const item of input.items) {
      const prod = await q<{ bulk_conversion: number | null; sell_price_eceran: number; sell_price_grosir: number }>(
        "select bulk_conversion, sell_price_eceran, sell_price_grosir from products where id = $1",
        [item.productId]
      );
      if (!prod.rowCount) throw new AppError(404, "product_not_found", "Product not found");
      const p = prod.rows[0];

      if (item.unitType === "grosir") {
        if (!p.bulk_conversion) throw new AppError(400, "no_bulk_unit", "Product has no grosir unit");
        const baseQty = item.qty * p.bulk_conversion;
        const subtotal = item.qty * p.sell_price_grosir;
        lines.push({ productId: item.productId, baseQty, unitPrice: p.sell_price_grosir, subtotal, unitType: "grosir" });
      } else {
        const subtotal = item.qty * p.sell_price_eceran;
        lines.push({ productId: item.productId, baseQty: item.qty, unitPrice: p.sell_price_eceran, subtotal, unitType: "eceran" });
      }
    }

    const total = lines.reduce((s, l) => s + l.subtotal, 0);
    if (input.paid < total) throw new AppError(400, "insufficient_payment", "Paid amount is less than the total");

    const invoiceNo = await nextInvoiceNo(q);
    const header = await q<SaleRow>(
      `insert into sales(tenant_id, invoice_no, customer_name, total, paid, change, payment_method, created_by)
       values (current_setting('app.current_tenant_id')::uuid,$1,$2,$3,$4,$5,$6,$7)
       returning id, invoice_no, customer_name, total, paid, change, payment_method, created_at`,
      [invoiceNo, input.customerName ?? null, total, input.paid, input.paid - total, input.paymentMethod, userId]
    );
    const saleId = header.rows[0].id;

    for (const l of lines) {
      await q(
        `insert into sale_items(tenant_id, sale_id, product_id, unit_type, qty, unit_price, subtotal)
         values (current_setting('app.current_tenant_id')::uuid,$1,$2,$3,$4,$5,$6)`,
        [saleId, l.productId, l.unitType, l.unitType === "grosir" ? l.baseQty / 1 : l.baseQty, l.unitPrice, l.subtotal]
      );
      // recordMovement enforces non-negative stock — throws if oversold
      await recordMovement(q, { productId: l.productId, type: "sale", refId: saleId, qtyBase: -l.baseQty });
    }
    return header.rows[0];
  });
}

export function listSales(tenantId: string, filter: { from?: string; to?: string }): Promise<SaleRow[]> {
  return withTenant(tenantId, async (q) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.from) { params.push(filter.from); where.push(`created_at >= $${params.length}`); }
    if (filter.to) { params.push(filter.to); where.push(`created_at <= $${params.length}`); }
    const sql =
      `select id, invoice_no, customer_name, total, paid, change, payment_method, created_at from sales` +
      (where.length ? ` where ${where.join(" and ")}` : "") +
      ` order by created_at desc limit 200`;
    return (await q<SaleRow>(sql, params)).rows;
  });
}
```

> Note on `sale_items.qty`: store the quantity in the unit the cashier picked — for `eceran` that is base units, for `grosir` that is bulk units. Fix Step 3's insert to pass the original `item.qty` for the grosir case rather than `baseQty`. Carry the original qty through the `lines` array: add `qty: item.qty` to each pushed line and insert `l.qty`. Make that correction when implementing.

- [ ] **Step 4: Create `apps/api/src/modules/grosir/sales.routes.ts`**

```ts
import { Hono } from "hono";
import { saleSchema, type JwtPayload } from "@app/shared";
import { createSale, listSales } from "./sales.service";

export const salesRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

// all roles (owner, manager, cashier) may sell — no requireRole guard
salesRoutes.get("/", async (c) =>
  c.json(await listSales(c.get("auth").tenantId!, {
    from: c.req.query("from") || undefined,
    to: c.req.query("to") || undefined,
  }))
);
salesRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  return c.json(await createSale(auth.tenantId!, auth.sub, saleSchema.parse(await c.req.json())), 201);
});
```

- [ ] **Step 5: Mount in `apps/api/src/modules/grosir/routes.ts`**

Add `grosirRouter.route("/sales", salesRoutes);`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/api test sales.service`
Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/grosir/sales.service.ts apps/api/src/modules/grosir/sales.routes.ts apps/api/src/modules/grosir/routes.ts apps/api/src/modules/grosir/sales.service.test.ts
git commit -m "feat: add penjualan (POS) service and routes"
```

### Task 41: Stock adjustment (barang keluar non-sale) — service + routes

Records a signed base-unit adjustment with a reason. One transaction: adjustment row + one movement. Owner/Manager only.

**Files:**
- Create: `apps/api/src/modules/grosir/adjustments.service.ts`, `apps/api/src/modules/grosir/adjustments.routes.ts`
- Modify: `apps/api/src/modules/grosir/routes.ts`
- Test: `apps/api/src/modules/grosir/adjustments.service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/grosir/adjustments.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { withTenant } from "../../db/withTenant";
import { recordMovement } from "./stock";
import { createAdjustment, listAdjustments } from "./adjustments.service";

let tenantId: string, userId: string, productId: string;

beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('AdjCo','adjco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
  userId = (await adminPool.query(
    "insert into users(tenant_id,email,password_hash,name,role) values ($1,'m@adjco','h','M','manager') returning id",
    [tenantId]
  )).rows[0].id;
  const unit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'pcs') returning id", [tenantId])).rows[0].id;
  productId = (await adminPool.query(
    `insert into products(tenant_id,sku,name,base_unit_id,buy_price,sell_price_eceran,sell_price_grosir,min_stock)
     values ($1,'P-ADJ','Telur',$2,2000,2500,28000,10) returning id`,
    [tenantId, unit]
  )).rows[0].id;
  await withTenant(tenantId, (q) => recordMovement(q, { productId, type: "in", refId: productId, qtyBase: 50 }));
});

describe("adjustments service", () => {
  it("applies a negative adjustment and decrements stock", async () => {
    const adj = await createAdjustment(tenantId, userId, {
      productId, qtyBase: -8, reason: "rusak", note: "pecah saat bongkar",
    });
    expect(adj.id).toBeTruthy();
    const p = await adminPool.query("select stock_qty from products where id=$1", [productId]);
    expect(p.rows[0].stock_qty).toBe(42);
  });
  it("lists adjustments", async () => {
    expect((await listAdjustments(tenantId)).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test adjustments.service`
Expected: FAIL — cannot find module `./adjustments.service`.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/adjustments.service.ts`**

```ts
import { withTenant } from "../../db/withTenant";
import { recordMovement } from "./stock";
import type { AdjustmentInput } from "@app/shared";

export interface AdjustmentRow {
  id: string; product_id: string; qty_base: number;
  reason: string; note: string | null; created_at: string;
}

export function createAdjustment(tenantId: string, userId: string, input: AdjustmentInput): Promise<AdjustmentRow> {
  return withTenant(tenantId, async (q) => {
    const row = await q<AdjustmentRow>(
      `insert into stock_adjustments(tenant_id, product_id, qty_base, reason, note, created_by)
       values (current_setting('app.current_tenant_id')::uuid,$1,$2,$3,$4,$5)
       returning id, product_id, qty_base, reason, note, created_at`,
      [input.productId, input.qtyBase, input.reason, input.note ?? null, userId]
    );
    await recordMovement(q, {
      productId: input.productId, type: "adjustment", refId: row.rows[0].id, qtyBase: input.qtyBase,
    });
    return row.rows[0];
  });
}

export function listAdjustments(tenantId: string): Promise<AdjustmentRow[]> {
  return withTenant(tenantId, async (q) =>
    (await q<AdjustmentRow>(
      "select id, product_id, qty_base, reason, note, created_at from stock_adjustments order by created_at desc limit 100"
    )).rows
  );
}
```

- [ ] **Step 4: Create `apps/api/src/modules/grosir/adjustments.routes.ts`**

```ts
import { Hono } from "hono";
import { adjustmentSchema, type JwtPayload } from "@app/shared";
import { requireRole } from "../../middleware/requireRole";
import { createAdjustment, listAdjustments } from "./adjustments.service";

export const adjustmentsRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

adjustmentsRoutes.get("/", async (c) => c.json(await listAdjustments(c.get("auth").tenantId!)));
adjustmentsRoutes.post("/", requireRole("owner", "manager"), async (c) => {
  const auth = c.get("auth");
  return c.json(await createAdjustment(auth.tenantId!, auth.sub, adjustmentSchema.parse(await c.req.json())), 201);
});
```

- [ ] **Step 5: Mount in `apps/api/src/modules/grosir/routes.ts`**

Add `grosirRouter.route("/adjustments", adjustmentsRoutes);`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/api test adjustments.service`
Expected: PASS — 2 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/grosir/adjustments.service.ts apps/api/src/modules/grosir/adjustments.routes.ts apps/api/src/modules/grosir/routes.ts apps/api/src/modules/grosir/adjustments.service.test.ts
git commit -m "feat: add stock adjustment service and routes"
```

### Task 42: Dashboard — service + routes

Aggregates today's figures for the grosir dashboard. All roles.

**Files:**
- Create: `apps/api/src/modules/grosir/dashboard.service.ts`, `apps/api/src/modules/grosir/dashboard.routes.ts`
- Modify: `apps/api/src/modules/grosir/routes.ts`
- Test: `apps/api/src/modules/grosir/dashboard.service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/grosir/dashboard.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { withTenant } from "../../db/withTenant";
import { recordMovement } from "./stock";
import { createSale } from "./sales.service";
import { getDashboard } from "./dashboard.service";

let tenantId: string, userId: string, productId: string;

beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('DashCo','dashco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
  userId = (await adminPool.query(
    "insert into users(tenant_id,email,password_hash,name,role) values ($1,'o@dashco','h','O','owner') returning id",
    [tenantId]
  )).rows[0].id;
  const unit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'pcs') returning id", [tenantId])).rows[0].id;
  productId = (await adminPool.query(
    `insert into products(tenant_id,sku,name,base_unit_id,buy_price,sell_price_eceran,sell_price_grosir,min_stock,stock_qty)
     values ($1,'P-DASH','Kopi',$2,8000,10000,95000,20,0) returning id`,
    [tenantId, unit]
  )).rows[0].id;
  await withTenant(tenantId, (q) => recordMovement(q, { productId, type: "in", refId: productId, qtyBase: 5 }));
  await createSale(tenantId, userId, {
    paymentMethod: "cash", paid: 50000, items: [{ productId, unitType: "eceran", qty: 2 }],
  });
});

describe("dashboard service", () => {
  it("reports today's sales total, txn count, and low-stock count", async () => {
    const d = await getDashboard(tenantId);
    expect(d.todaySalesTotal).toBe(20000);
    expect(d.todayTxnCount).toBe(1);
    expect(d.lowStockCount).toBe(1); // stock 3 <= min_stock 20
    expect(Array.isArray(d.topProducts)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test dashboard.service`
Expected: FAIL — cannot find module `./dashboard.service`.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/dashboard.service.ts`**

```ts
import { withTenant } from "../../db/withTenant";

export interface Dashboard {
  todaySalesTotal: number;
  todayTxnCount: number;
  lowStockCount: number;
  topProducts: { product_id: string; name: string; qty_sold: number }[];
}

export function getDashboard(tenantId: string): Promise<Dashboard> {
  return withTenant(tenantId, async (q) => {
    const today = await q<{ total: string; count: string }>(
      `select coalesce(sum(total),0)::bigint as total, count(*)::int as count
         from sales where created_at::date = current_date`
    );
    const lowStock = await q<{ n: number }>(
      "select count(*)::int n from products where is_active and stock_qty <= min_stock"
    );
    const top = await q<{ product_id: string; name: string; qty_sold: number }>(
      `select si.product_id, p.name, sum(si.qty)::int as qty_sold
         from sale_items si
         join sales s on s.id = si.sale_id
         join products p on p.id = si.product_id
        where s.created_at >= current_date - interval '30 days'
        group by si.product_id, p.name
        order by qty_sold desc
        limit 5`
    );
    return {
      todaySalesTotal: Number(today.rows[0].total),
      todayTxnCount: Number(today.rows[0].count),
      lowStockCount: lowStock.rows[0].n,
      topProducts: top.rows,
    };
  });
}
```

- [ ] **Step 4: Create `apps/api/src/modules/grosir/dashboard.routes.ts`**

```ts
import { Hono } from "hono";
import type { JwtPayload } from "@app/shared";
import { getDashboard } from "./dashboard.service";

export const dashboardRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

dashboardRoutes.get("/", async (c) => c.json(await getDashboard(c.get("auth").tenantId!)));
```

- [ ] **Step 5: Mount in `apps/api/src/modules/grosir/routes.ts`**

Add `grosirRouter.route("/dashboard", dashboardRoutes);`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/api test dashboard.service`
Expected: PASS — 1 test.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/grosir/dashboard.service.ts apps/api/src/modules/grosir/dashboard.routes.ts apps/api/src/modules/grosir/routes.ts apps/api/src/modules/grosir/dashboard.service.test.ts
git commit -m "feat: add grosir dashboard service and routes"
```

### Task 43: Notifications — service + routes

Read/list tenant notifications and mark them read. Notifications are written by the low-stock scan job (Task 45). All roles read.

**Files:**
- Create: `apps/api/src/modules/grosir/notifications.service.ts`, `apps/api/src/modules/grosir/notifications.routes.ts`
- Modify: `apps/api/src/modules/grosir/routes.ts`
- Test: `apps/api/src/modules/grosir/notifications.service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/grosir/notifications.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { listNotifications, markRead, createNotification } from "./notifications.service";

let tenantId: string;
beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('NotifCo','notifco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
});

describe("notifications service", () => {
  it("creates, lists, and marks a notification read", async () => {
    const n = await createNotification(tenantId, { type: "low_stock", title: "Stok menipis", body: "Beras" });
    let list = await listNotifications(tenantId, { unreadOnly: true });
    expect(list.some((x) => x.id === n.id)).toBe(true);

    await markRead(tenantId, n.id);
    list = await listNotifications(tenantId, { unreadOnly: true });
    expect(list.some((x) => x.id === n.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test notifications.service`
Expected: FAIL — cannot find module `./notifications.service`.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/notifications.service.ts`**

```ts
import { withTenant } from "../../db/withTenant";
import { AppError } from "../../lib/errors";

export interface NotificationRow {
  id: string; type: string; title: string; body: string | null;
  is_read: boolean; created_at: string;
}

export function createNotification(
  tenantId: string,
  input: { type: string; title: string; body?: string }
): Promise<NotificationRow> {
  return withTenant(tenantId, async (q) =>
    (await q<NotificationRow>(
      `insert into notifications(tenant_id, type, title, body)
       values (current_setting('app.current_tenant_id')::uuid,$1,$2,$3)
       returning id, type, title, body, is_read, created_at`,
      [input.type, input.title, input.body ?? null]
    )).rows[0]
  );
}

export function listNotifications(
  tenantId: string,
  filter: { unreadOnly?: boolean }
): Promise<NotificationRow[]> {
  return withTenant(tenantId, async (q) => {
    const sql =
      `select id, type, title, body, is_read, created_at from notifications` +
      (filter.unreadOnly ? " where is_read = false" : "") +
      " order by created_at desc limit 100";
    return (await q<NotificationRow>(sql)).rows;
  });
}

export function markRead(tenantId: string, id: string): Promise<void> {
  return withTenant(tenantId, async (q) => {
    const r = await q("update notifications set is_read = true where id = $1", [id]);
    if (!r.rowCount) throw new AppError(404, "not_found", "Notification not found");
  });
}
```

- [ ] **Step 4: Create `apps/api/src/modules/grosir/notifications.routes.ts`**

```ts
import { Hono } from "hono";
import type { JwtPayload } from "@app/shared";
import { listNotifications, markRead } from "./notifications.service";

export const notificationsRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

notificationsRoutes.get("/", async (c) =>
  c.json(await listNotifications(c.get("auth").tenantId!, {
    unreadOnly: c.req.query("unreadOnly") === "true",
  }))
);
notificationsRoutes.patch("/:id/read", async (c) => {
  await markRead(c.get("auth").tenantId!, c.req.param("id"));
  return c.json({ ok: true });
});
```

- [ ] **Step 5: Mount in `apps/api/src/modules/grosir/routes.ts`**

Add `grosirRouter.route("/notifications", notificationsRoutes);`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/api test notifications.service`
Expected: PASS — 1 test.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/grosir/notifications.service.ts apps/api/src/modules/grosir/notifications.routes.ts apps/api/src/modules/grosir/routes.ts apps/api/src/modules/grosir/notifications.service.test.ts
git commit -m "feat: add notifications service and routes"
```

### Task 44: Reports — service, routes, and async CSV export job

A report request creates an `export_jobs` row (`pending`) and enqueues an `export-generation` job. The worker builds the CSV to `EXPORT_DIR`, flips the row to `done`, and writes a notification. The route also returns the in-memory report data for immediate on-screen display. Owner/Manager only.

**Files:**
- Create: `apps/api/src/modules/grosir/reports.service.ts`, `apps/api/src/modules/grosir/reports.routes.ts`, `apps/api/src/queue/jobs/exportGeneration.ts`
- Modify: `apps/api/src/modules/grosir/routes.ts`
- Test: `apps/api/src/modules/grosir/reports.service.test.ts`, `apps/api/src/queue/jobs/exportGeneration.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/grosir/reports.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { withTenant } from "../../db/withTenant";
import { recordMovement } from "./stock";
import { createSale } from "./sales.service";
import { salesReport, stockReport, requestExport } from "./reports.service";

let tenantId: string, userId: string, productId: string;

beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('RepCo','repco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
  userId = (await adminPool.query(
    "insert into users(tenant_id,email,password_hash,name,role) values ($1,'o@repco','h','O','owner') returning id",
    [tenantId]
  )).rows[0].id;
  const unit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'pcs') returning id", [tenantId])).rows[0].id;
  productId = (await adminPool.query(
    `insert into products(tenant_id,sku,name,base_unit_id,buy_price,sell_price_eceran,sell_price_grosir,min_stock,stock_qty)
     values ($1,'P-REP','Mie',$2,2500,3000,34000,10,0) returning id`,
    [tenantId, unit]
  )).rows[0].id;
  await withTenant(tenantId, (q) => recordMovement(q, { productId, type: "in", refId: productId, qtyBase: 100 }));
  await createSale(tenantId, userId, {
    paymentMethod: "cash", paid: 30000, items: [{ productId, unitType: "eceran", qty: 4 }],
  });
});

describe("reports service", () => {
  it("sales report sums totals in a date range", async () => {
    const r = await salesReport(tenantId, { from: "2000-01-01", to: "2999-01-01" });
    expect(r.grandTotal).toBe(12000);
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
  });
  it("stock report lists current balances", async () => {
    const r = await stockReport(tenantId);
    expect(r.find((x) => x.product_id === productId)?.stock_qty).toBe(96);
  });
  it("requestExport creates a pending export job", async () => {
    const job = await requestExport(tenantId, userId, "sales", { from: "2000-01-01", to: "2999-01-01" });
    expect(job.status).toBe("pending");
  });
});
```

`apps/api/src/queue/jobs/exportGeneration.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adminPool } from "../../db/pool";
import { requestExport } from "../../modules/grosir/reports.service";
import { exportProcessor } from "./exportGeneration";
import type { Job } from "bullmq";
import type { ExportJob } from "../queues";

let tenantId: string, userId: string;
beforeAll(async () => {
  process.env.EXPORT_DIR = mkdtempSync(join(tmpdir(), "exports-"));
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('ExpCo','expco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
  userId = (await adminPool.query(
    "insert into users(tenant_id,email,password_hash,name,role) values ($1,'o@expco','h','O','owner') returning id",
    [tenantId]
  )).rows[0].id;
});

describe("export generation processor", () => {
  it("writes a CSV file and flips the job to done", async () => {
    const job = await requestExport(tenantId, userId, "sales", { from: "2000-01-01", to: "2999-01-01" });
    await exportProcessor({ data: { exportJobId: job.id, tenantId } } as Job<ExportJob>);

    const row = await adminPool.query("select status, file_path from export_jobs where id=$1", [job.id]);
    expect(row.rows[0].status).toBe("done");
    expect(existsSync(row.rows[0].file_path)).toBe(true);
    expect(readFileSync(row.rows[0].file_path, "utf8")).toContain("invoice_no");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/api test reports.service` and `pnpm --filter @app/api test exportGeneration`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `apps/api/src/modules/grosir/reports.service.ts`**

```ts
import { withTenant } from "../../db/withTenant";
import { exportQueue } from "../../queue/queues";

export interface SalesReportRow {
  invoice_no: string; total: number; payment_method: string; created_at: string;
}
export interface StockReportRow {
  product_id: string; sku: string; name: string; stock_qty: number; min_stock: number;
}
export interface ExportJobRow {
  id: string; type: string; status: string; file_path: string | null; created_at: string;
}

export function salesReport(
  tenantId: string,
  range: { from: string; to: string }
): Promise<{ rows: SalesReportRow[]; grandTotal: number }> {
  return withTenant(tenantId, async (q) => {
    const r = await q<SalesReportRow>(
      `select invoice_no, total, payment_method, created_at
         from sales
        where created_at::date between $1 and $2
        order by created_at`,
      [range.from, range.to]
    );
    const grandTotal = r.rows.reduce((s, row) => s + Number(row.total), 0);
    return { rows: r.rows, grandTotal };
  });
}

export function stockReport(tenantId: string): Promise<StockReportRow[]> {
  return withTenant(tenantId, async (q) =>
    (await q<StockReportRow>(
      `select id as product_id, sku, name, stock_qty, min_stock
         from products where is_active order by name`
    )).rows
  );
}

export function requestExport(
  tenantId: string,
  userId: string,
  type: "sales" | "stock",
  params: Record<string, string>
): Promise<ExportJobRow> {
  return withTenant(tenantId, async (q) => {
    const row = await q<ExportJobRow>(
      `insert into export_jobs(tenant_id, type, params, created_by)
       values (current_setting('app.current_tenant_id')::uuid,$1,$2,$3)
       returning id, type, status, file_path, created_at`,
      [type, JSON.stringify(params), userId]
    );
    await exportQueue.add("generate", { exportJobId: row.rows[0].id, tenantId });
    return row.rows[0];
  });
}

export function listExports(tenantId: string): Promise<ExportJobRow[]> {
  return withTenant(tenantId, async (q) =>
    (await q<ExportJobRow>(
      "select id, type, status, file_path, created_at from export_jobs order by created_at desc limit 50"
    )).rows
  );
}
```

- [ ] **Step 4: Create `apps/api/src/queue/jobs/exportGeneration.ts`**

```ts
import type { Job } from "bullmq";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { withTenant, withAdmin } from "../../db/withTenant";
import { salesReport, stockReport } from "../../modules/grosir/reports.service";
import { createNotification } from "../../modules/grosir/notifications.service";
import type { ExportJob } from "../queues";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export async function exportProcessor(job: Job<ExportJob>): Promise<void> {
  const { exportJobId, tenantId } = job.data;

  // load the job row + params via admin pool
  const jobRow = await withAdmin(async (q) =>
    (await q<{ type: string; params: Record<string, string> }>(
      "select type, params from export_jobs where id = $1",
      [exportJobId]
    )).rows[0]
  );
  if (!jobRow) return;

  await withAdmin((q) =>
    q("update export_jobs set status = 'processing' where id = $1", [exportJobId])
  );

  try {
    let csv: string;
    if (jobRow.type === "sales") {
      const report = await salesReport(tenantId, {
        from: jobRow.params.from, to: jobRow.params.to,
      });
      csv = toCsv(report.rows as unknown as Record<string, unknown>[]);
    } else {
      const rows = await stockReport(tenantId);
      csv = toCsv(rows as unknown as Record<string, unknown>[]);
    }

    const dir = join(process.env.EXPORT_DIR ?? "/data/exports", tenantId);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${jobRow.type}-${exportJobId}.csv`);
    writeFileSync(filePath, csv, "utf8");

    await withAdmin((q) =>
      q("update export_jobs set status = 'done', file_path = $2 where id = $1", [exportJobId, filePath])
    );
    await createNotification(tenantId, {
      type: "export_ready",
      title: "Export selesai",
      body: `Laporan ${jobRow.type} siap diunduh`,
    });
  } catch (e) {
    await withAdmin((q) =>
      q("update export_jobs set status = 'failed' where id = $1", [exportJobId])
    );
    throw e;
  }
}
```

> Note: `EXPORT_DIR` is a Docker volume mounted on both `api` and `worker` (see `docker-compose.yml` Task 2). The file written by the worker is therefore readable by the api container for download.

- [ ] **Step 5: Create `apps/api/src/modules/grosir/reports.routes.ts`**

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { JwtPayload } from "@app/shared";
import { requireRole } from "../../middleware/requireRole";
import { salesReport, stockReport, requestExport, listExports } from "./reports.service";

export const reportsRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

const rangeSchema = z.object({ from: z.string(), to: z.string() });

reportsRoutes.use("*", requireRole("owner", "manager"));

reportsRoutes.get("/sales", async (c) => {
  const range = rangeSchema.parse({ from: c.req.query("from"), to: c.req.query("to") });
  return c.json(await salesReport(c.get("auth").tenantId!, range));
});
reportsRoutes.get("/stock", async (c) => c.json(await stockReport(c.get("auth").tenantId!)));
reportsRoutes.get("/exports", async (c) => c.json(await listExports(c.get("auth").tenantId!)));
reportsRoutes.post("/exports", async (c) => {
  const auth = c.get("auth");
  const body = z.object({
    type: z.enum(["sales", "stock"]),
    params: z.record(z.string()).default({}),
  }).parse(await c.req.json());
  return c.json(await requestExport(auth.tenantId!, auth.sub, body.type, body.params), 202);
});
```

- [ ] **Step 6: Mount in `apps/api/src/modules/grosir/routes.ts`**

Add `grosirRouter.route("/reports", reportsRoutes);`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @app/api test reports.service` then `pnpm --filter @app/api test exportGeneration`
Expected: PASS — 3 + 1 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/grosir/reports.service.ts apps/api/src/modules/grosir/reports.routes.ts apps/api/src/queue/jobs/exportGeneration.ts apps/api/src/modules/grosir/routes.ts apps/api/src/modules/grosir/reports.service.test.ts apps/api/src/queue/jobs/exportGeneration.test.ts
git commit -m "feat: add reports service, routes, and async csv export job"
```

### Task 45: Low-stock scan job

A repeatable job (registered hourly in `worker.ts`, Task 17) that scans every active tenant and inserts a `low_stock` notification per product at or below `min_stock`, skipping products that already have an unread `low_stock` notification.

**Files:**
- Create: `apps/api/src/queue/jobs/lowStockScan.ts`
- Test: `apps/api/src/queue/jobs/lowStockScan.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/queue/jobs/lowStockScan.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { lowStockProcessor } from "./lowStockScan";
import type { Job } from "bullmq";
import type { LowStockScanJob } from "../queues";

let tenantId: string;
beforeAll(async () => {
  const t = await adminPool.query(
    "insert into tenants(name,slug,sector) values ('LowCo','lowco','grosir') returning id"
  );
  tenantId = t.rows[0].id;
  const unit = (await adminPool.query("insert into units(tenant_id,name) values ($1,'pcs') returning id", [tenantId])).rows[0].id;
  // one product below min, one above
  await adminPool.query(
    `insert into products(tenant_id,sku,name,base_unit_id,buy_price,sell_price_eceran,sell_price_grosir,min_stock,stock_qty)
     values ($1,'LOW-1','Sabun',$2,1,1,1,10,2), ($1,'OK-1','Pasta',$2,1,1,1,5,50)`,
    [tenantId, unit]
  );
});

describe("low-stock scan", () => {
  it("creates a notification only for products at or below min_stock", async () => {
    await lowStockProcessor({} as Job<LowStockScanJob>);
    const notifs = await adminPool.query(
      "select title, body from notifications where tenant_id=$1 and type='low_stock'",
      [tenantId]
    );
    expect(notifs.rowCount).toBe(1);
    expect(notifs.rows[0].body).toContain("Sabun");
  });

  it("does not duplicate an existing unread low-stock notification", async () => {
    await lowStockProcessor({} as Job<LowStockScanJob>);
    const notifs = await adminPool.query(
      "select count(*)::int n from notifications where tenant_id=$1 and type='low_stock'",
      [tenantId]
    );
    expect(notifs.rows[0].n).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test lowStockScan`
Expected: FAIL — cannot find module `./lowStockScan`.

- [ ] **Step 3: Create `apps/api/src/queue/jobs/lowStockScan.ts`**

```ts
import type { Job } from "bullmq";
import { withAdmin } from "../../db/withTenant";
import type { LowStockScanJob } from "../queues";

export async function lowStockProcessor(_job: Job<LowStockScanJob>): Promise<void> {
  await withAdmin(async (q) => {
    // products at/below threshold that do NOT already have an unread low_stock notification for them
    const low = await q<{ tenant_id: string; name: string; stock_qty: number; min_stock: number }>(
      `select p.tenant_id, p.name, p.stock_qty, p.min_stock
         from products p
        where p.is_active
          and p.stock_qty <= p.min_stock
          and not exists (
            select 1 from notifications n
             where n.tenant_id = p.tenant_id
               and n.type = 'low_stock'
               and n.is_read = false
               and n.body = p.name
          )`
    );
    for (const row of low.rows) {
      await q(
        `insert into notifications(tenant_id, type, title, body)
         values ($1, 'low_stock', $2, $3)`,
        [row.tenant_id, "Stok menipis", row.name]
      );
    }
  });
}
```

> Note: matching on `n.body = p.name` is a simple dedupe key. If two products could share a name within a tenant, switch the dedupe to store `product_id` in a dedicated column — out of scope here; product names are effectively unique per tenant for a sembako shop.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/api test lowStockScan`
Expected: PASS — 2 tests.

- [ ] **Step 5: Verify the worker compiles**

Run: `pnpm --filter @app/api build`
Expected: build succeeds — all four job processors now exist, `worker.ts` compiles.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/queue/jobs/lowStockScan.ts apps/api/src/queue/jobs/lowStockScan.test.ts
git commit -m "feat: add low-stock scan job"
```

### Task 46: Grosir RLS isolation tests

Extends the security backstop to the grosir tables — proves one tenant cannot read or write another tenant's products, sales, or stock.

**Files:**
- Create: `apps/api/src/modules/grosir/grosir-rls.test.ts`

- [ ] **Step 1: Write the test**

`apps/api/src/modules/grosir/grosir-rls.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { adminPool } from "../../db/pool";
import { withTenant } from "../../db/withTenant";

let tenantA: string, tenantB: string, productB: string;

beforeAll(async () => {
  const a = await adminPool.query("insert into tenants(name,slug,sector) values ('GA','g-rls-a','grosir') returning id");
  const b = await adminPool.query("insert into tenants(name,slug,sector) values ('GB','g-rls-b','grosir') returning id");
  tenantA = a.rows[0].id;
  tenantB = b.rows[0].id;
  const unitB = (await adminPool.query("insert into units(tenant_id,name) values ($1,'pcs') returning id", [tenantB])).rows[0].id;
  productB = (await adminPool.query(
    `insert into products(tenant_id,sku,name,base_unit_id,buy_price,sell_price_eceran,sell_price_grosir,min_stock)
     values ($1,'B-SKU','B Product',$2,1,1,1,0) returning id`,
    [tenantB, unitB]
  )).rows[0].id;
});

describe("grosir RLS isolation", () => {
  it("tenant A cannot SELECT tenant B products", async () => {
    const rows = await withTenant(tenantA, async (q) =>
      (await q("select id from products")).rows
    );
    expect(rows.find((r: { id: string }) => r.id === productB)).toBeUndefined();
  });

  it("tenant A cannot UPDATE tenant B products", async () => {
    const affected = await withTenant(tenantA, async (q) =>
      (await q("update products set name = 'HACKED' where id = $1", [productB])).rowCount
    );
    expect(affected).toBe(0);
  });

  it("tenant A cannot INSERT a product for tenant B", async () => {
    await expect(
      withTenant(tenantA, async (q) =>
        q(
          `insert into products(tenant_id,sku,name,base_unit_id,buy_price,sell_price_eceran,sell_price_grosir,min_stock)
           values ($1,'EVIL','Evil',
             (select id from units where tenant_id=$1 limit 1),1,1,1,0)`,
          [tenantB]
        )
      )
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `pnpm --filter @app/api test grosir-rls`
Expected: PASS — 3 tests. If any fails, the `apply_tenant_rls` helper in migration 003 did not apply a policy to that table — verify migration 003 calls `apply_tenant_rls` for it.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/grosir/grosir-rls.test.ts
git commit -m "test: add grosir RLS isolation suite"
```

### Task 47: Grosir FE foundation — module API helper + sidebar nav

A `grosirApi` helper that prefixes calls with `/t/:tenantId/m`, a shared `formatRupiah` util, and the grosir sidebar links wired into the tenant shell.

**Files:**
- Create: `apps/web/src/lib/grosir.ts`, `apps/web/src/lib/format.ts`
- Modify: `apps/web/src/app/t/[slug]/layout.tsx` (add grosir links)
- Test: `apps/web/src/lib/format.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatRupiah } from "./format";

describe("formatRupiah", () => {
  it("formats integer rupiah with thousands separators", () => {
    expect(formatRupiah(146000)).toBe("Rp 146.000");
    expect(formatRupiah(0)).toBe("Rp 0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/web test format`
Expected: FAIL — cannot find module `./format`.

- [ ] **Step 3: Create `apps/web/src/lib/format.ts`**

```ts
export function formatRupiah(value: number): string {
  return "Rp " + value.toLocaleString("id-ID");
}
```

- [ ] **Step 4: Create `apps/web/src/lib/grosir.ts`**

```ts
import { apiFetch } from "./api";
import { getSession } from "./auth";

function tenantId(): string {
  const s = getSession();
  if (!s?.tenantId) throw new Error("no tenant session");
  return s.tenantId;
}

/** Calls the grosir module, which is mounted at /t/:tenantId/m/... on the API. */
export function grosirApi<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/t/${tenantId()}/m${path}`, init);
}
```

- [ ] **Step 5: Add grosir links to `apps/web/src/app/t/[slug]/layout.tsx`**

Replace the `{/* grosir module links injected in Phase 2 */}` comment with:

```tsx
{ctx?.sector === "grosir" && (
  <>
    <Link href={`/t/${params.slug}/pos`} className="block font-display font-bold">POS / Penjualan</Link>
    <Link href={`/t/${params.slug}/products`} className="block font-display font-bold">Produk</Link>
    <Link href={`/t/${params.slug}/stock-in`} className="block font-display font-bold">Barang Masuk</Link>
    <Link href={`/t/${params.slug}/adjustments`} className="block font-display font-bold">Penyesuaian Stok</Link>
    <Link href={`/t/${params.slug}/masterdata`} className="block font-display font-bold">Master Data</Link>
    <Link href={`/t/${params.slug}/reports`} className="block font-display font-bold">Laporan</Link>
    <Link href={`/t/${params.slug}/notifications`} className="block font-display font-bold">Notifikasi</Link>
  </>
)}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @app/web test format`
Expected: PASS — 1 test.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/grosir.ts apps/web/src/lib/format.ts apps/web/src/lib/format.test.ts apps/web/src/app/t/[slug]/layout.tsx
git commit -m "feat: add grosir fe api helper and sidebar nav"
```

### Task 48: Master data page

One page with three sections — categories, units, suppliers — each a list plus an inline create form.

**Files:**
- Create: `apps/web/src/app/t/[slug]/(grosir)/masterdata/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/t/[slug]/(grosir)/masterdata/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Input, Badge } from "@app/ui";
import { grosirApi } from "@/lib/grosir";

interface Named { id: string; name: string }

function CrudSection({ title, path }: { title: string; path: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data } = useQuery({ queryKey: [path], queryFn: () => grosirApi<Named[]>(path) });
  const create = useMutation({
    mutationFn: () => grosirApi(path, { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: [path] }); },
  });

  return (
    <Card>
      <h2 className="text-xl font-black mb-3">{title}</h2>
      <div className="flex flex-wrap gap-2 mb-3">
        {(data ?? []).map((x) => <Badge key={x.id} tone="soft">{x.name}</Badge>)}
      </div>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Tambah ${title.toLowerCase()}`} />
        <Button variant="primary" onClick={() => create.mutate()} disabled={!name || create.isPending}>+ Tambah</Button>
      </div>
    </Card>
  );
}

export default function MasterDataPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Master Data</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <CrudSection title="Kategori" path="/masterdata/categories" />
        <CrudSection title="Satuan" path="/masterdata/units" />
        <CrudSection title="Supplier" path="/masterdata/suppliers" />
      </div>
    </div>
  );
}
```

> Note: the supplier section here only sends `name`. That is valid against `supplierSchema` (phone/address optional). A fuller supplier form with phone/address can be added later; the spec only requires supplier CRUD, satisfied here.

- [ ] **Step 2: Manual verification**

Log in as a grosir owner, open Master Data, add a category/unit/supplier, confirm each appears as a badge.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/t/[slug]/(grosir)/masterdata"
git commit -m "feat: add grosir master data page"
```

### Task 49: Products page

Product list in a table, plus a modal create/edit form with pricing and unit selection.

**Files:**
- Create: `apps/web/src/app/t/[slug]/(grosir)/products/page.tsx`, `apps/web/src/components/grosir/ProductForm.tsx`

- [ ] **Step 1: Create `apps/web/src/components/grosir/ProductForm.tsx`**

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductInput } from "@app/shared";
import { Button, Input, Select } from "@app/ui";
import { grosirApi } from "@/lib/grosir";
import { useQuery } from "@tanstack/react-query";

interface Named { id: string; name: string }

export function ProductForm({ initial, onDone }: {
  initial?: ProductInput & { id: string };
  onDone: () => void;
}) {
  const { data: units } = useQuery({ queryKey: ["/masterdata/units"], queryFn: () => grosirApi<Named[]>("/masterdata/units") });
  const { data: categories } = useQuery({ queryKey: ["/masterdata/categories"], queryFn: () => grosirApi<Named[]>("/masterdata/categories") });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: initial,
  });

  async function onSubmit(values: ProductInput) {
    const body = JSON.stringify(values);
    if (initial) await grosirApi(`/products/${initial.id}`, { method: "PUT", body });
    else await grosirApi("/products", { method: "POST", body });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <Input label="SKU" {...register("sku")} error={errors.sku?.message} />
      <Input label="Nama" {...register("name")} error={errors.name?.message} />
      <Select label="Kategori" {...register("categoryId")}>
        <option value="">— pilih —</option>
        {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Select label="Satuan dasar (eceran)" {...register("baseUnitId")} error={errors.baseUnitId?.message}>
        <option value="">— pilih —</option>
        {(units ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </Select>
      <Select label="Satuan grosir (opsional)" {...register("bulkUnitId")}>
        <option value="">— tidak ada —</option>
        {(units ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </Select>
      <Input label="Konversi grosir (isi ke base)" type="number" {...register("bulkConversion", { valueAsNumber: true })} error={errors.bulkConversion?.message} />
      <Input label="Harga beli (per eceran)" type="number" {...register("buyPrice", { valueAsNumber: true })} error={errors.buyPrice?.message} />
      <Input label="Harga jual eceran" type="number" {...register("sellPriceEceran", { valueAsNumber: true })} error={errors.sellPriceEceran?.message} />
      <Input label="Harga jual grosir (per satuan grosir)" type="number" {...register("sellPriceGrosir", { valueAsNumber: true })} error={errors.sellPriceGrosir?.message} />
      <Input label="Stok minimum" type="number" {...register("minStock", { valueAsNumber: true })} error={errors.minStock?.message} />
      <Button type="submit" variant="primary" disabled={isSubmitting}>Simpan</Button>
    </form>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/app/t/[slug]/(grosir)/products/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Table, Badge, Modal } from "@app/ui";
import { grosirApi } from "@/lib/grosir";
import { formatRupiah } from "@/lib/format";
import { ProductForm } from "@/components/grosir/ProductForm";

interface Product {
  id: string; sku: string; name: string; stock_qty: number; min_stock: number;
  sell_price_eceran: number; sell_price_grosir: number; is_active: boolean;
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["/products"], queryFn: () => grosirApi<Product[]>("/products") });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black">Produk</h1>
        <Button variant="primary" onClick={() => setOpen(true)}>+ Produk baru</Button>
      </div>
      <Table head={
        <tr>
          <th className="p-3">SKU</th><th className="p-3">Nama</th><th className="p-3">Stok</th>
          <th className="p-3">Harga eceran</th><th className="p-3">Harga grosir</th>
        </tr>
      }>
        {(data ?? []).map((p) => (
          <tr key={p.id}>
            <td className="p-3 font-bold">{p.sku}</td>
            <td className="p-3">{p.name}</td>
            <td className="p-3">
              {p.stock_qty}
              {p.stock_qty <= p.min_stock && <Badge tone="accent" className="ml-2">menipis</Badge>}
            </td>
            <td className="p-3">{formatRupiah(p.sell_price_eceran)}</td>
            <td className="p-3">{formatRupiah(p.sell_price_grosir)}</td>
          </tr>
        ))}
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title="Produk baru">
        <ProductForm onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["/products"] }); }} />
      </Modal>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Create a product (with and without a bulk unit), confirm it lists with formatted prices and a "menipis" badge when `stock_qty ≤ min_stock`.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/t/[slug]/(grosir)/products" apps/web/src/components/grosir/ProductForm.tsx
git commit -m "feat: add grosir products page"
```

### Task 50: Barang masuk page

A form that builds a list of stock-in line items (product, unit, qty, unit cost) then submits the whole delivery.

**Files:**
- Create: `apps/web/src/app/t/[slug]/(grosir)/stock-in/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/t/[slug]/(grosir)/stock-in/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Input, Select, Table } from "@app/ui";
import { grosirApi } from "@/lib/grosir";
import { formatRupiah } from "@/lib/format";

interface Named { id: string; name: string }
interface Product { id: string; name: string }
interface Line { productId: string; unitId: string; qty: number; unitCost: number }

export default function StockInPage() {
  const qc = useQueryClient();
  const { data: products } = useQuery({ queryKey: ["/products"], queryFn: () => grosirApi<Product[]>("/products") });
  const { data: units } = useQuery({ queryKey: ["/masterdata/units"], queryFn: () => grosirApi<Named[]>("/masterdata/units") });
  const { data: suppliers } = useQuery({ queryKey: ["/masterdata/suppliers"], queryFn: () => grosirApi<Named[]>("/masterdata/suppliers") });

  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<Line>({ productId: "", unitId: "", qty: 1, unitCost: 0 });

  const submit = useMutation({
    mutationFn: () =>
      grosirApi("/stock-in", {
        method: "POST",
        body: JSON.stringify({ supplierId: supplierId || undefined, note: note || undefined, items: lines }),
      }),
    onSuccess: () => {
      setLines([]); setNote(""); setSupplierId("");
      qc.invalidateQueries({ queryKey: ["/products"] });
    },
  });

  function addLine() {
    if (!draft.productId || !draft.unitId || draft.qty < 1) return;
    setLines((l) => [...l, draft]);
    setDraft({ productId: "", unitId: "", qty: 1, unitCost: 0 });
  }

  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Barang Masuk</h1>
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— tanpa supplier —</option>
            {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-black mb-3">Tambah item</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <Select label="Produk" value={draft.productId} onChange={(e) => setDraft({ ...draft, productId: e.target.value })}>
            <option value="">—</option>
            {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select label="Satuan" value={draft.unitId} onChange={(e) => setDraft({ ...draft, unitId: e.target.value })}>
            <option value="">—</option>
            {(units ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Input label="Qty" type="number" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} />
          <Input label="Harga/satuan" type="number" value={draft.unitCost} onChange={(e) => setDraft({ ...draft, unitCost: Number(e.target.value) })} />
          <Button variant="secondary" onClick={addLine}>+ Tambah</Button>
        </div>
      </Card>
      <Table head={<tr><th className="p-3">Produk</th><th className="p-3">Qty</th><th className="p-3">Harga</th><th className="p-3">Subtotal</th></tr>}>
        {lines.map((l, i) => (
          <tr key={i}>
            <td className="p-3">{products?.find((p) => p.id === l.productId)?.name}</td>
            <td className="p-3">{l.qty}</td>
            <td className="p-3">{formatRupiah(l.unitCost)}</td>
            <td className="p-3">{formatRupiah(l.qty * l.unitCost)}</td>
          </tr>
        ))}
      </Table>
      <Card className="flex items-center justify-between">
        <span className="text-2xl font-black">Total: {formatRupiah(total)}</span>
        <Button variant="primary" onClick={() => submit.mutate()} disabled={lines.length === 0 || submit.isPending}>
          Simpan barang masuk
        </Button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Add two line items (one in a bulk unit, one in the base unit), submit, then check the Produk page — stock increased by the base-unit-converted total.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/t/[slug]/(grosir)/stock-in"
git commit -m "feat: add barang masuk page"
```

### Task 51: POS / Penjualan page

The cashier's main screen: search products, add to a cart with a unit-type choice, then check out with paid amount and payment method.

**Files:**
- Create: `apps/web/src/app/t/[slug]/(grosir)/pos/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/t/[slug]/(grosir)/pos/page.tsx`**

```tsx
"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Button, Input, Select, Table, Toast } from "@app/ui";
import { grosirApi } from "@/lib/grosir";
import { formatRupiah } from "@/lib/format";

interface Product {
  id: string; sku: string; name: string; stock_qty: number;
  sell_price_eceran: number; sell_price_grosir: number; bulk_conversion: number | null;
}
interface CartLine { product: Product; unitType: "eceran" | "grosir"; qty: number }

export default function PosPage() {
  const { data: products } = useQuery({ queryKey: ["/products"], queryFn: () => grosirApi<Product[]>("/products?activeOnly=true") });
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paid, setPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "qris">("cash");
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(
    () => (products ?? []).filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
    ),
    [products, search]
  );

  function lineUnitPrice(l: CartLine): number {
    return l.unitType === "grosir" ? l.product.sell_price_grosir : l.product.sell_price_eceran;
  }
  const total = cart.reduce((s, l) => s + l.qty * lineUnitPrice(l), 0);
  const change = paid - total;

  function addToCart(product: Product) {
    setCart((c) => [...c, { product, unitType: "eceran", qty: 1 }]);
  }
  function updateLine(i: number, patch: Partial<CartLine>) {
    setCart((c) => c.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setCart((c) => c.filter((_, idx) => idx !== i));
  }

  async function checkout() {
    try {
      const sale = await grosirApi<{ invoice_no: string; change: number }>("/sales", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod,
          paid,
          items: cart.map((l) => ({ productId: l.product.id, unitType: l.unitType, qty: l.qty })),
        }),
      });
      setToast(`Sukses: ${sale.invoice_no} · kembalian ${formatRupiah(sale.change)}`);
      setCart([]); setPaid(0);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Gagal menyimpan transaksi");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-3">
        <h1 className="text-3xl font-black">Penjualan</h1>
        <Input placeholder="Cari produk / SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <Card key={p.id} hover className="cursor-pointer" onClick={() => addToCart(p)}>
              <p className="font-black">{p.name}</p>
              <p className="text-fg/70 text-sm">{p.sku} · stok {p.stock_qty}</p>
              <p className="font-bold">{formatRupiah(p.sell_price_eceran)}</p>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl font-black">Keranjang</h2>
        <Table head={<tr><th className="p-2">Produk</th><th className="p-2">Satuan</th><th className="p-2">Qty</th><th className="p-2">Subtotal</th><th className="p-2"></th></tr>}>
          {cart.map((l, i) => (
            <tr key={i}>
              <td className="p-2">{l.product.name}</td>
              <td className="p-2">
                <select
                  className="border-2 border-fg rounded px-1"
                  value={l.unitType}
                  onChange={(e) => updateLine(i, { unitType: e.target.value as CartLine["unitType"] })}
                >
                  <option value="eceran">eceran</option>
                  {l.product.bulk_conversion ? <option value="grosir">grosir</option> : null}
                </select>
              </td>
              <td className="p-2">
                <input
                  type="number" min={1} value={l.qty}
                  className="w-16 border-2 border-fg rounded px-1"
                  onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                />
              </td>
              <td className="p-2">{formatRupiah(l.qty * lineUnitPrice(l))}</td>
              <td className="p-2">
                <button className="text-accent font-black" onClick={() => removeLine(i)}>✕</button>
              </td>
            </tr>
          ))}
        </Table>
        <Card className="space-y-2">
          <p className="text-2xl font-black">Total: {formatRupiah(total)}</p>
          <Select label="Metode bayar" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
            <option value="cash">Tunai</option>
            <option value="transfer">Transfer</option>
            <option value="qris">QRIS</option>
          </Select>
          <Input label="Dibayar" type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} />
          <p className={`font-bold ${change < 0 ? "text-accent" : ""}`}>Kembalian: {formatRupiah(change)}</p>
          <Button variant="primary" onClick={checkout} disabled={cart.length === 0 || paid < total}>
            Bayar
          </Button>
        </Card>
      </div>
      {toast && <Toast tone="secondary" message={toast} />}
    </div>
  );
}
```

> Note: after a successful checkout, invalidate the `/products` query so stock counts refresh — add `useQueryClient` and call `qc.invalidateQueries({ queryKey: ["/products"] })` inside the `checkout` success path when implementing.

- [ ] **Step 2: Manual verification**

Stock a product via Barang Masuk, open POS, add it to the cart in both `eceran` and `grosir` units, pay, confirm the success toast shows an invoice number and correct change, and product stock dropped by the base-unit total.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/t/[slug]/(grosir)/pos"
git commit -m "feat: add pos / penjualan page"
```

### Task 52: Stock adjustment page

A form to record a signed base-unit adjustment with a reason, plus a list of recent adjustments.

**Files:**
- Create: `apps/web/src/app/t/[slug]/(grosir)/adjustments/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/t/[slug]/(grosir)/adjustments/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Input, Select, Table } from "@app/ui";
import { grosirApi } from "@/lib/grosir";

interface Product { id: string; name: string }
interface Adjustment {
  id: string; product_id: string; qty_base: number; reason: string; note: string | null; created_at: string;
}

export default function AdjustmentsPage() {
  const qc = useQueryClient();
  const { data: products } = useQuery({ queryKey: ["/products"], queryFn: () => grosirApi<Product[]>("/products") });
  const { data: list } = useQuery({ queryKey: ["/adjustments"], queryFn: () => grosirApi<Adjustment[]>("/adjustments") });

  const [productId, setProductId] = useState("");
  const [qtyBase, setQtyBase] = useState(0);
  const [reason, setReason] = useState<"rusak" | "hilang" | "koreksi">("rusak");
  const [note, setNote] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      grosirApi("/adjustments", {
        method: "POST",
        body: JSON.stringify({ productId, qtyBase, reason, note: note || undefined }),
      }),
    onSuccess: () => {
      setProductId(""); setQtyBase(0); setNote("");
      qc.invalidateQueries({ queryKey: ["/adjustments"] });
      qc.invalidateQueries({ queryKey: ["/products"] });
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Penyesuaian Stok</h1>
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Select label="Produk" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">—</option>
            {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input label="Qty (negatif = keluar)" type="number" value={qtyBase} onChange={(e) => setQtyBase(Number(e.target.value))} />
          <Select label="Alasan" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            <option value="rusak">Rusak</option>
            <option value="hilang">Hilang</option>
            <option value="koreksi">Koreksi</option>
          </Select>
          <Input label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="mt-3">
          <Button variant="primary" onClick={() => submit.mutate()} disabled={!productId || qtyBase === 0 || submit.isPending}>
            Simpan penyesuaian
          </Button>
        </div>
      </Card>
      <Table head={<tr><th className="p-3">Produk</th><th className="p-3">Qty</th><th className="p-3">Alasan</th><th className="p-3">Catatan</th></tr>}>
        {(list ?? []).map((a) => (
          <tr key={a.id}>
            <td className="p-3">{products?.find((p) => p.id === a.product_id)?.name ?? a.product_id}</td>
            <td className="p-3 font-bold">{a.qty_base}</td>
            <td className="p-3">{a.reason}</td>
            <td className="p-3">{a.note}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Record a `-5` `rusak` adjustment, confirm the product's stock dropped by 5 and the row appears in the list.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/t/[slug]/(grosir)/adjustments"
git commit -m "feat: add stock adjustment page"
```

### Task 53: Grosir dashboard

Replaces the Phase 1 placeholder in `apps/web/src/app/t/[slug]/page.tsx` with the real dashboard for grosir tenants.

**Files:**
- Modify: `apps/web/src/app/t/[slug]/page.tsx`

- [ ] **Step 1: Replace the grosir branch in `apps/web/src/app/t/[slug]/page.tsx`**

Replace the whole file with:

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { Card, Badge } from "@app/ui";
import { fetchTenantContext } from "@/lib/tenant";
import { grosirApi } from "@/lib/grosir";
import { formatRupiah } from "@/lib/format";

interface Dashboard {
  todaySalesTotal: number;
  todayTxnCount: number;
  lowStockCount: number;
  topProducts: { product_id: string; name: string; qty_sold: number }[];
}

function GrosirDashboard() {
  const { data } = useQuery({ queryKey: ["/dashboard"], queryFn: () => grosirApi<Dashboard>("/dashboard") });
  if (!data) return <p className="text-fg/70">Loading…</p>;
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card hover>
          <p className="text-fg/70 font-bold">Penjualan hari ini</p>
          <p className="text-4xl font-black">{formatRupiah(data.todaySalesTotal)}</p>
        </Card>
        <Card hover>
          <p className="text-fg/70 font-bold">Transaksi hari ini</p>
          <p className="text-4xl font-black">{data.todayTxnCount}</p>
        </Card>
        <Card hover>
          <p className="text-fg/70 font-bold">Produk stok menipis</p>
          <p className="text-4xl font-black">{data.lowStockCount}</p>
        </Card>
      </div>
      <Card>
        <h2 className="text-xl font-black mb-3">Produk terlaris (30 hari)</h2>
        <ul className="space-y-1">
          {data.topProducts.map((p) => (
            <li key={p.product_id} className="font-bold">✦ {p.name} — {p.qty_sold}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function TenantDashboard() {
  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });
  if (!ctx) return <p className="text-fg/70">Loading…</p>;
  if (ctx.sector === "grosir") return <GrosirDashboard />;
  return (
    <Card className="max-w-lg">
      <h1 className="text-3xl font-black mb-2">Module coming soon</h1>
      <p className="text-fg/70">
        The <Badge tone="soft">{ctx.sector}</Badge> module is not available yet.
      </p>
    </Card>
  );
}
```

- [ ] **Step 2: Manual verification**

Log in as a grosir tenant after making a sale; confirm the dashboard shows today's total, txn count, low-stock count, and a top-products list.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/t/[slug]/page.tsx"
git commit -m "feat: add grosir dashboard"
```

### Task 54: Reports page

Sales report (date range) and stock report, each with an "Export CSV" button that fires an async export job, plus a list of past exports with download links.

**Files:**
- Create: `apps/web/src/app/t/[slug]/(grosir)/reports/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/t/[slug]/(grosir)/reports/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Input, Table, Badge } from "@app/ui";
import { grosirApi } from "@/lib/grosir";
import { formatRupiah } from "@/lib/format";

interface SalesReport {
  rows: { invoice_no: string; total: number; payment_method: string; created_at: string }[];
  grandTotal: number;
}
interface StockRow { product_id: string; sku: string; name: string; stock_qty: number; min_stock: number }
interface ExportJob { id: string; type: string; status: string; file_path: string | null; created_at: string }

export default function ReportsPage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const sales = useQuery({
    queryKey: ["/reports/sales", from, to],
    queryFn: () => grosirApi<SalesReport>(`/reports/sales?from=${from}&to=${to}`),
  });
  const stock = useQuery({ queryKey: ["/reports/stock"], queryFn: () => grosirApi<StockRow[]>("/reports/stock") });
  const exports = useQuery({ queryKey: ["/reports/exports"], queryFn: () => grosirApi<ExportJob[]>("/reports/exports") });

  const requestExport = useMutation({
    mutationFn: (type: "sales" | "stock") =>
      grosirApi("/reports/exports", {
        method: "POST",
        body: JSON.stringify({ type, params: type === "sales" ? { from, to } : {} }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/reports/exports"] }),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Laporan</h1>

      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <Input label="Dari" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Sampai" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="secondary" onClick={() => requestExport.mutate("sales")}>Export CSV penjualan</Button>
        </div>
        <p className="mt-3 text-2xl font-black">
          Total penjualan: {formatRupiah(sales.data?.grandTotal ?? 0)}
        </p>
      </Card>

      <Table head={<tr><th className="p-3">Invoice</th><th className="p-3">Total</th><th className="p-3">Bayar</th><th className="p-3">Waktu</th></tr>}>
        {(sales.data?.rows ?? []).map((r) => (
          <tr key={r.invoice_no}>
            <td className="p-3 font-bold">{r.invoice_no}</td>
            <td className="p-3">{formatRupiah(r.total)}</td>
            <td className="p-3">{r.payment_method}</td>
            <td className="p-3">{new Date(r.created_at).toLocaleString("id-ID")}</td>
          </tr>
        ))}
      </Table>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-black">Laporan stok</h2>
          <Button variant="secondary" onClick={() => requestExport.mutate("stock")}>Export CSV stok</Button>
        </div>
        <Table head={<tr><th className="p-3">SKU</th><th className="p-3">Nama</th><th className="p-3">Stok</th></tr>}>
          {(stock.data ?? []).map((s) => (
            <tr key={s.product_id}>
              <td className="p-3 font-bold">{s.sku}</td>
              <td className="p-3">{s.name}</td>
              <td className="p-3">
                {s.stock_qty}
                {s.stock_qty <= s.min_stock && <Badge tone="accent" className="ml-2">menipis</Badge>}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <h2 className="text-xl font-black mb-3">Riwayat export</h2>
        <ul className="space-y-1">
          {(exports.data ?? []).map((e) => (
            <li key={e.id} className="font-bold">
              ✦ {e.type} — <Badge tone={e.status === "done" ? "secondary" : "soft"}>{e.status}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
```

> Note: download links — the export file lands in the shared `EXPORT_DIR` volume. Serving it requires a small authenticated `GET /reports/exports/:id/download` route in `reports.routes.ts` that streams the file for a `done` job. Add that route (read `file_path`, return the file with `content-type: text/csv`) and point each "done" list item at it. Keep it owner/manager-guarded like the rest of `reportsRoutes`.

- [ ] **Step 2: Add the download route to `apps/api/src/modules/grosir/reports.routes.ts`**

```ts
import { readFileSync } from "node:fs";
import { AppError } from "../../lib/errors";
import { withTenant } from "../../db/withTenant";

reportsRoutes.get("/exports/:id/download", async (c) => {
  const tenantId = c.get("auth").tenantId!;
  const row = await withTenant(tenantId, async (q) =>
    (await q<{ status: string; file_path: string | null; type: string }>(
      "select status, file_path, type from export_jobs where id = $1",
      [c.req.param("id")]
    )).rows[0]
  );
  if (!row || row.status !== "done" || !row.file_path) {
    throw new AppError(404, "not_ready", "Export is not ready");
  }
  return new Response(readFileSync(row.file_path), {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="${row.type}.csv"`,
    },
  });
});
```

- [ ] **Step 3: Manual verification**

Make a sale, open Laporan, confirm the sales total and rows; click "Export CSV penjualan", confirm a job appears and turns `done`; confirm the low-stock notification fires (Task 45 worker), and the download route returns a CSV.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/t/[slug]/(grosir)/reports" apps/web/src/modules 2>/dev/null; git add "apps/web/src/app/t/[slug]/(grosir)/reports" apps/api/src/modules/grosir/reports.routes.ts
git commit -m "feat: add reports page and csv download route"
```

### Task 55: Notifications page

Lists tenant notifications; lets the user mark them read.

**Files:**
- Create: `apps/web/src/app/t/[slug]/(grosir)/notifications/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/t/[slug]/(grosir)/notifications/page.tsx`**

```tsx
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Badge } from "@app/ui";
import { grosirApi } from "@/lib/grosir";

interface Notification {
  id: string; type: string; title: string; body: string | null; is_read: boolean; created_at: string;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["/notifications"], queryFn: () => grosirApi<Notification[]>("/notifications") });
  const markRead = useMutation({
    mutationFn: (id: string) => grosirApi(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/notifications"] }),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Notifikasi</h1>
      <div className="space-y-3">
        {(data ?? []).map((n) => (
          <Card key={n.id} className="flex items-center justify-between">
            <div>
              <p className="font-black">
                {n.title} {!n.is_read && <Badge tone="accent" className="ml-2">baru</Badge>}
              </p>
              <p className="text-fg/70">{n.body}</p>
            </div>
            {!n.is_read && (
              <Button variant="white" onClick={() => markRead.mutate(n.id)}>Tandai dibaca</Button>
            )}
          </Card>
        ))}
        {(data ?? []).length === 0 && <p className="text-fg/70">Belum ada notifikasi.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Drive a product below `min_stock`, run the worker's low-stock scan (or trigger the queue manually), confirm a "Stok menipis" notification appears here and "Tandai dibaca" clears the "baru" badge.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/t/[slug]/(grosir)/notifications"
git commit -m "feat: add notifications page"
```

### Task 56: Phase 2 end-to-end test

One Playwright flow that exercises the whole grosir vertical: a tenant owner sets up master data, creates a product, stocks it in, makes a sale, and sees the dashboard update.

**Files:**
- Create: `e2e/tests/phase2-grosir.spec.ts`

- [ ] **Step 1: Write `e2e/tests/phase2-grosir.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

// Assumes a grosir tenant + owner already seeded (reuse the Phase 1 e2e tenant,
// or seed one in a beforeAll via the API). Here we use a dedicated slug.
const SLUG = process.env.E2E_GROSIR_SLUG!;
const OWNER_EMAIL = `owner@${SLUG}.com`;

test.describe.serial("grosir vertical", () => {
  test("owner logs in and sets up master data", async ({ page }) => {
    await page.goto(`/t/${SLUG}/login`);
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password").fill("secret12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${SLUG}$`));

    await page.goto(`/t/${SLUG}/masterdata`);
    // provisioning already seeded default categories + units; just confirm they render
    await expect(page.getByText("Sembako")).toBeVisible();
    await expect(page.getByText("pcs")).toBeVisible();
  });

  test("owner creates a product, stocks it in, and completes a sale", async ({ page }) => {
    // login
    await page.goto(`/t/${SLUG}/login`);
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password").fill("secret12");
    await page.getByRole("button", { name: "Sign in" }).click();

    // create product
    await page.goto(`/t/${SLUG}/products`);
    await page.getByRole("button", { name: "+ Produk baru" }).click();
    await page.getByLabel("SKU").fill("E2E-GULA");
    await page.getByLabel("Nama").fill("Gula E2E");
    await page.getByLabel("Satuan dasar (eceran)").selectOption({ label: "pcs" });
    await page.getByLabel("Harga beli (per eceran)").fill("10000");
    await page.getByLabel("Harga jual eceran").fill("12000");
    await page.getByLabel("Harga jual grosir (per satuan grosir)").fill("0");
    await page.getByLabel("Stok minimum").fill("5");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Gula E2E")).toBeVisible();

    // stock in
    await page.goto(`/t/${SLUG}/stock-in`);
    await page.getByLabel("Produk").selectOption({ label: "Gula E2E" });
    await page.getByLabel("Satuan").selectOption({ label: "pcs" });
    await page.getByLabel("Qty").fill("50");
    await page.getByLabel("Harga/satuan").fill("10000");
    await page.getByRole("button", { name: "+ Tambah" }).click();
    await page.getByRole("button", { name: "Simpan barang masuk" }).click();

    // sale via POS
    await page.goto(`/t/${SLUG}/pos`);
    await page.getByPlaceholder("Cari produk / SKU").fill("Gula E2E");
    await page.getByText("Gula E2E").click();
    await page.getByLabel("Dibayar").fill("50000");
    await page.getByRole("button", { name: "Bayar" }).click();
    await expect(page.getByText(/Sukses: INV-/)).toBeVisible();

    // dashboard reflects the sale
    await page.goto(`/t/${SLUG}`);
    await expect(page.getByText("Transaksi hari ini")).toBeVisible();
  });
});
```

- [ ] **Step 2: Seed a grosir tenant for the e2e run**

Add to the e2e run command: register a grosir tenant via the admin API (or reuse the Phase 1 `SLUG` if still present), export its slug as `E2E_GROSIR_SLUG`. Example helper script `e2e/seed-grosir.sh`:

```bash
#!/usr/bin/env bash
set -e
SLUG="e2e-grosir-$(date +%s)"
TOKEN=$(curl -s localhost:4000/api/v1/auth/admin-login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@local","password":"admin123"}' | sed -E 's/.*"accessToken":"([^"]+)".*/\1/')
curl -s localhost:4000/api/v1/admin/tenants \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"name\":\"E2E Grosir\",\"slug\":\"$SLUG\",\"sector\":\"grosir\",\"ownerEmail\":\"owner@$SLUG.com\",\"ownerPassword\":\"secret12\"}"
echo "$SLUG"
```

- [ ] **Step 3: Run the Phase 2 e2e**

Run:
```bash
docker compose --profile dev up -d && pnpm migrate && pnpm seed:admin admin@local admin123
export E2E_GROSIR_SLUG=$(bash e2e/seed-grosir.sh)
pnpm --filter @app/e2e test phase2-grosir
```
Expected: PASS — 2 tests.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm -r test && pnpm --filter @app/e2e test`
Expected: all unit/integration suites pass, both e2e specs pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/phase2-grosir.spec.ts e2e/seed-grosir.sh
git commit -m "test: add phase 2 grosir e2e"
```

**✅ Phase 2 complete** — the grosir vertical ships: master data, products with dual pricing, barang masuk with unit conversion, POS that records sales + decrements stock, stock adjustments, dashboard, reports with async CSV export, low-stock notifications. The product is usable end to end for a grosir sembako tenant.

---

## Phases 3–7 — Roadmap (not yet task-detailed)

These phases are in scope but **not task-detailed here** — the source spec (§13) defers their detailed design until immediately before each phase starts. When a phase begins: run the brainstorming skill for that sector/feature, then the writing-plans skill, and append the resulting tasks to this document.

The module-registry architecture (Task 20, Task 34) means each sector module is added as a new `apps/api/src/modules/<sector>` folder + one `registerModule(...)` call + a `(sector)` route group on the web — **no changes to Phase 1/2 core code**.

| Phase | Scope | Entry criteria |
|-------|-------|----------------|
| **3 — Retail module** | `retail` sector vertical (toko kelontong: products, POS, stock, reports — likely a near-variant of grosir with single-unit pricing). | Brainstorm + plan retail before starting. Reuse grosir patterns where they fit; do not copy-paste — extract shared inventory/POS logic into a `packages/inventory-core` if duplication is real. |
| **4 — F&B module** | `fnb` sector vertical (menu items, recipes/bahan, ingredient stock deduction per sale). | Brainstorm + plan. New domain concepts (recipe → ingredient movements) — needs its own schema migration. |
| **5 — Jasa module** | `jasa` sector vertical (job orders, service status workflow, customer records). | Brainstorm + plan. No inventory core; order-lifecycle domain. |
| **6 — Apotek module** | `apotek` sector vertical (batch + expiry tracking, stricter stock rules). | Brainstorm + plan. Extends the product/stock model with batches + expiry dates. |
| **7 — Platform extras** | Tenant-level audit logging, billing / subscriptions, tenant-level custom roles + permissions, CI/CD pipeline. | Brainstorm + plan each sub-feature. Audit logging and CI/CD are low-risk; billing and custom roles each warrant their own spec. |

Until its phase ships, a non-grosir tenant registers normally and lands on the "module coming soon" dashboard (Task 30).
