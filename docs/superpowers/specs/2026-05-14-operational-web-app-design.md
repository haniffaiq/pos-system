# Operational Web App — Multi-Tenant Operational Platform — Design Spec

**App name:** Operational Web App
**Date:** 2026-05-14
**Status:** Approved design — ready for implementation planning
**Scope:** Full product, delivered as one phased plan — see §13

---

## 1. Overview

**Operational Web App** is a multi-tenant operational platform for companies. It hosts
many tenants across different business sectors; each tenant gets an operational
toolset for its sector. A platform super-admin registers and manages tenants.

This spec covers the **full product**, delivered through a single **phased
implementation plan** (see §13). Sections 1–12 fully specify the **multi-tenancy
core** and the **grosir sembako** (wholesale groceries) vertical — phases 1–2, which
ship a usable product end to end. Later phases (other sector modules, platform
extras) are named in the roadmap; each phase's detailed flows and schema are fleshed
out immediately before that phase begins.

### Build context

The overall product is several subsystems: multi-tenancy core, super-admin panel,
tenant onboarding, inventory (barang masuk/keluar), pricing engine (satuan/eceran),
sales/pemasukan, then additional sector verticals. All of it lives in one phased plan
so progress is tracked in one place. The module-registry architecture (§3.3) keeps
each sector vertical isolated, so later phases plug in without touching the core.

---

## 2. Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js (App Router), React |
| Backend | Hono.js (REST API) |
| Worker | BullMQ worker — same code as API, separate process/container |
| Database | PostgreSQL 16, row-level security (RLS) enabled |
| DB access | **Raw SQL** via `pg` driver — hand-written queries, numbered `.sql` migration files. No ORM, no query builder. |
| Cache / queue | Redis 7 — refresh-token store + BullMQ queue |
| Deployment | Docker Compose, separate containers per service |
| Styling | Tailwind CSS — Comic / Neo-Brutalism design system |

---

## 3. Architecture

### 3.1 Repository layout (monorepo, pnpm workspaces)

```
/apps
  /web        Next.js — FE container
  /api        Hono.js REST API + BullMQ worker (shared code, two entrypoints)
/packages
  /shared     TS types, zod schemas, shared constants
  /ui         neo-brutalism React component library
/db
  /migrations numbered raw .sql files
  /seeds      seed scripts
docker-compose.yml
.env.example
```

### 3.2 Containers (docker-compose)

| Container | Image | Role |
|-----------|-------|------|
| `web` | Next.js | Frontend; talks to `api` over HTTP |
| `api` | Hono.js | REST API; sets RLS context per request |
| `worker` | same image as `api` | BullMQ worker; different entrypoint; keeps API latency clean |
| `db` | postgres:16 | Postgres with RLS |
| `redis` | redis:7 | Refresh-token store + BullMQ queue |
| `mailhog` | mailhog | **Dev profile only** — SMTP capture for email testing |

### 3.3 Sector module system

Chosen approach: **module registry**. Each sector is a self-contained module:

- Backend: `/apps/api/src/modules/<sector>` — routes, queries, jobs.
- Frontend: a route group under `/apps/web`.
- A central registry maps `sector → module`. A tenant's `sector` field gates which
  routes and UI load.

Adding sector #2 = new module folder + one registry entry. Zero core changes.

Rejected alternatives: everything in core behind feature flags (turns to spaghetti by
sector #3); separate service per sector (max isolation, ops overkill).

### 3.4 Sectors offered at registration

- `grosir` — full module, phase 2.
- `retail`, `fnb`, `jasa`, `apotek` — registerable from phase 1; full modules land in
  phases 3–6. Until then these tenants register and see a generic "module coming
  soon" dashboard.

---

## 4. Multi-tenancy & isolation

**Model:** shared database, row-level. Every tenant-scoped table carries a
`tenant_id` column. Postgres RLS is the backstop against application bugs.

**RLS mechanic:**
- Policy on each tenant-scoped table:
  `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`.
- The API opens a transaction, runs `SET LOCAL app.current_tenant_id = $1`, then runs
  queries. The setting is transaction-scoped — no leakage between requests.
- `tenant_id` comes from the authenticated user's JWT.

**Platform admin access:** the super-admin connects via a **separate DB role with
`BYPASSRLS`** so cross-tenant queries (tenant lists, platform dashboard) work. The
tenant-facing API uses a normal role subject to RLS.

---

## 5. Authentication & authorization

### 5.1 Auth

- **JWT access token** — short-lived, carries `user_id`, `tenant_id`, `role` (or
  `platform_admin` flag for super-admins).
- **Refresh token** — tracked in Redis, revocable. Rotation on refresh.
- Hono JWT middleware validates the access token and, for tenant routes, sets the RLS
  context from the token's `tenant_id`.

### 5.2 Tenant resolution / routing

Path-based:
- Super-admin: `/admin/*`
- Tenant: `/t/:slug/*`
- API: `/api/v1/auth/*`, `/api/v1/admin/*` (platform), `/api/v1/t/:tenantId/*` (tenant-scoped)

### 5.3 Roles inside a tenant

Three fixed roles: **Owner**, **Manager**, **Cashier**.

| Action | Owner | Manager | Cashier |
|--------|:--:|:--:|:--:|
| Tenant settings, user management | ✓ | – | – |
| Master data (categories, units, suppliers), products, pricing | ✓ | ✓ | – |
| Barang masuk, stock adjustments | ✓ | ✓ | – |
| Penjualan (POS) | ✓ | ✓ | ✓ |
| Reports / exports | ✓ | ✓ | – |
| Dashboard | ✓ | ✓ | ✓ (sales-only view) |

Super-admin is a separate platform-level identity (`platform_admins`), not a tenant role.

---

## 6. Data model

Postgres, raw SQL migrations, **UUID v7** primary keys (time-sortable). RLS enabled on
every tenant-scoped table.

### 6.1 Platform scope (no `tenant_id`, super-admin only)

| Table | Key columns |
|-------|-------------|
| `platform_admins` | email, password_hash, name |
| `tenants` | name, slug, sector, status (active/suspended), settings jsonb, created_at |
| `platform_audit_log` | admin_id, action, target, meta jsonb, created_at |

### 6.2 Tenant scope (all carry `tenant_id`, RLS enforced)

| Table | Key columns |
|-------|-------------|
| `users` | tenant_id, email, password_hash, name, role (owner/manager/cashier), status |
| `categories` | tenant_id, name |
| `units` | tenant_id, name (pcs, dus, karton…) |
| `products` | tenant_id, category_id, sku, name, base_unit_id, bulk_unit_id (nullable), bulk_conversion (e.g. 24), buy_price, sell_price_eceran (per base unit), sell_price_grosir (per bulk unit), min_stock, stock_qty (cached, base units), is_active |
| `suppliers` | tenant_id, name, phone, address |
| `stock_in` | tenant_id, supplier_id (nullable), note, total_cost, created_by, created_at |
| `stock_in_items` | stock_in_id, product_id, unit_id, qty, unit_cost, subtotal |
| `sales` | tenant_id, invoice_no, customer_name (nullable), total, paid, change, payment_method, created_by, created_at |
| `sale_items` | sale_id, product_id, unit_type (eceran/grosir), qty, unit_price, subtotal |
| `stock_adjustments` | tenant_id, product_id, qty_base (signed), reason (rusak/hilang/koreksi), note, created_by |
| `stock_movements` | tenant_id, product_id, type (in/sale/adjustment), ref_id, qty_base (signed), balance_after, created_at |
| `notifications` | tenant_id, type, title, body, is_read, created_at |
| `export_jobs` | tenant_id, type, status, file_path (nullable), params jsonb, created_by, created_at |

### 6.3 Pricing & unit model

- A product has a **base unit** (eceran unit, e.g. `pcs`) — stock is always tracked in
  base units.
- An optional **bulk unit** (grosir, e.g. `karton`) with a `bulk_conversion` integer
  (e.g. 1 karton = 24 pcs).
- `buy_price` — cost per base unit.
- `sell_price_eceran` — sell price per base unit.
- `sell_price_grosir` — sell price per bulk unit.
- A sale line picks `unit_type` = `eceran` or `grosir`:
  - `eceran`: deducts `qty` base units; income = `qty × sell_price_eceran`.
  - `grosir`: deducts `qty × bulk_conversion` base units; income = `qty × sell_price_grosir`.

### 6.4 Stock truth

- `stock_movements` — append-only ledger; the source of truth for stock history.
- `products.stock_qty` — cached current value for fast reads.
- Every stock-affecting operation (stock-in, sale, adjustment) writes a movement row
  **and** updates the cached `stock_qty` **and** the parent row, all in **one DB
  transaction**.

### 6.5 Money

All monetary values stored as **integer Rupiah**. No floating point anywhere.

---

## 7. Grosir module — flows

1. **Master data** — categories, units, suppliers: CRUD. (Owner/Manager)
2. **Products** — CRUD with full pricing (base/bulk unit, conversion, buy price, two
   sell prices, min_stock). (Owner/Manager; Cashier read-only)
3. **Barang masuk (stock-in)** — pick supplier, add line items (product, unit, qty,
   unit cost), submit → creates `stock_in` + `stock_in_items` + `stock_movements` +
   updates `products.stock_qty`, in one transaction. (Owner/Manager)
4. **Penjualan (POS)** — cart UI: search product → pick `unit_type` (eceran/grosir) →
   qty → line. Checkout: total, paid, change, payment method → creates `sales` +
   `sale_items` + `stock_movements` (type `sale`) + decrements stock, one transaction.
   Invoice number auto-generated per tenant. (All roles; Cashier is the primary user)
5. **Stock adjustment (barang keluar, non-sale)** — product, signed qty, reason
   (rusak/hilang/koreksi), note → `stock_adjustments` + `stock_movements`.
   (Owner/Manager)
6. **Dashboard** — today's sales total, transaction count, low-stock count, top
   products.
7. **Reports** — sales report and stock report over a date range; CSV export → queued
   `export-generation` job. (Owner/Manager)
8. **Notifications** — low-stock alert list.

---

## 8. Super-admin panel

- **Login** — `platform_admins` credentials.
- **Tenants list** — search, filter by status.
- **Register tenant** — name, slug, sector, owner email + initial password → creates
  `tenants` row + owner `users` row → fires `tenant-provisioning` job.
- **Tenant detail** — info, users, suspend/activate.
- **Platform dashboard** — tenant counts, breakdown by sector, recent registrations.
- **Audit log** — view of `platform_audit_log`.

---

## 9. Background jobs (BullMQ on Redis)

| Job | Trigger | Work |
|-----|---------|------|
| `tenant-provisioning` | On tenant registration | Seed default categories (Sembako, Minuman, …), default units (pcs, dus, karton), default tenant settings; then enqueue welcome email |
| `email` | Various | Tenant invites, password reset, welcome emails. SMTP via env; dev uses Mailhog |
| `low-stock-scan` | Repeatable cron (hourly) | Per tenant: find products where `stock_qty ≤ min_stock`; insert `notifications` (dedupe against existing unread) |
| `export-generation` | On report export request | Build CSV → write to shared volume → update `export_jobs.status` + `file_path` → notify |

The worker runs as a separate container (`worker`) sharing the `api` image.

---

## 10. Frontend & design system

### 10.1 Stack details

- Next.js App Router. Server components for reads where possible; client components
  for the POS cart and forms.
- Data layer: TanStack Query for client-side cache and mutations; `fetch` with the
  JWT.
- Forms: react-hook-form + zod, schemas shared from `/packages/shared`.
- Motion: framer-motion **only** for scroll-reveal and hero entrance. Hover motion is
  pure CSS.

### 10.2 Comic / Neo-Brutalism design system

Per the provided design documentation. Key points wired into the Tailwind config and
`/packages/ui`:

- **Color tokens:** background `#f5f5f5`, foreground `#222222`, card `#ffffff`,
  primary `#f6b233`, secondary `#5bc0be`, accent `#ff6b6b`. Borders are always the
  foreground black, never tinted.
- **Typography:** Space Grotesk (display — headings, buttons, labels, `font-black`),
  Inter (body). Mobile-first scale.
- **The 3-layer mechanic:** 2px solid black border, hard offset shadow (no blur),
  hover-lift. Shadow utilities: `brutal` (4px 4px 0 #222), `brutal-sm` (2px 2px 0),
  `brutal-lg` (8px 8px 0).
- **`/packages/ui` components:** Button, Card, Badge, Chip, IconTile, LogoChip, Input,
  Select, Table, Modal, Toast, Navbar — each applies the mechanic.
- **Shells:** super-admin shell, tenant shell (sidebar + topbar), auth pages.
- Hold the rules: black borders only, no blur on shadows, dark text on colored fills,
  ✦ star bullets, alternating section backgrounds with `border-y`.

---

## 11. Cross-cutting concerns

- **Validation** — zod schemas shared between FE and BE (`/packages/shared`).
- **Error handling** — uniform API error shape `{ error: { code, message, details? } }`,
  enforced by Hono error middleware.
- **Transactions** — every stock-affecting operation wrapped in a single DB
  transaction (movement + cache + parent row).
- **Configuration** — all secrets, SMTP, and DB connection via environment variables;
  `.env.example` committed.
- **Audit** — platform-level actions logged to `platform_audit_log`. Tenant-level
  audit logging arrives in phase 7 (§13).

---

## 12. Testing

- **Backend (Vitest):**
  - Unit — stock calculation, unit conversion, pricing logic.
  - Integration — API routes against a test Postgres.
  - **RLS isolation tests are mandatory** — prove tenant A cannot read tenant B's
    data.
- **Frontend:**
  - Vitest + React Testing Library for `/packages/ui` components.
  - Playwright e2e for 3 critical flows: login, register tenant, complete a sale.
- **Queue** — job processors tested as plain functions.

---

## 13. Implementation phases (roadmap)

Whole product, one phased plan. Sections 1–12 fully specify phases 1–2. Phases 3–7
are named here; each gets its detailed flows + schema worked out immediately before
that phase starts (the registry architecture in §3.3 keeps them isolated from the
core).

| Phase | Scope | Detailed in |
|-------|-------|-------------|
| **1 — Multi-tenancy core** | Monorepo + Docker Compose, Postgres + RLS, raw-SQL migration setup, JWT auth + Redis refresh store, super-admin panel, tenant registration + provisioning job, module registry | §§3–9 (this doc) |
| **2 — Grosir vertical** | Master data, products + pricing, barang masuk, POS/penjualan, stock adjustments, dashboard, reports + CSV export, low-stock notifications, all grosir queue jobs | §§6–10 (this doc) |
| **3 — Retail module** | `retail` sector vertical | Designed before phase start |
| **4 — F&B module** | `fnb` sector vertical (menu + bahan) | Designed before phase start |
| **5 — Jasa module** | `jasa` sector vertical (job orders) | Designed before phase start |
| **6 — Apotek module** | `apotek` sector vertical (batch + expiry tracking) | Designed before phase start |
| **7 — Platform extras** | Tenant-level audit logging, billing / subscriptions, tenant-level custom roles + permissions, CI/CD pipeline | Designed before phase start |

Until its phase ships, a non-grosir sector tenant registers and lands on a generic
"module coming soon" dashboard.
