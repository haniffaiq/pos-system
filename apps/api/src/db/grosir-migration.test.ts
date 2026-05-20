import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const grosirMigrationPath = resolve(__dirname, "../../../../db/migrations/003_grosir.sql");

const TABLES = [
  "categories",
  "units",
  "suppliers",
  "products",
  "stock_in",
  "stock_in_items",
  "sales",
  "sale_items",
  "stock_adjustments",
  "stock_movements",
  "notifications",
  "export_jobs",
] as const;

describe("003 grosir migration", () => {
  const sql = () => readFileSync(grosirMigrationPath, "utf8");

  it("creates all grosir tables as tenant-scoped tables", () => {
    const migration = sql();

    for (const table of TABLES) {
      expect(migration).toContain(`create table ${table}`);
      expect(migration).toMatch(new RegExp(`create table ${table} \\([\\s\\S]*?tenant_id\\s+uuid not null references tenants\\(id\\) on delete cascade`));
    }
  });

  it("applies tenant RLS with matching read and write policies", () => {
    const migration = sql();

    expect(migration).toContain("create or replace function apply_tenant_rls(tbl regclass) returns void");
    expect(migration).toContain("alter table %s enable row level security");
    expect(migration).toContain("alter table %s force row level security");
    expect(migration).toContain("current_setting(''app.platform_mode'', true) = ''on''");
    expect(migration).toContain("tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid");
    expect(migration).not.toContain("to app");
    for (const table of TABLES) {
      expect(migration).toContain(`select apply_tenant_rls('${table}')`);
    }
  });

  it("keeps product relationships inside the same tenant", () => {
    const migration = sql();

    expect(migration).toContain("unique (tenant_id, id)");
    expect(migration).toContain("foreign key (tenant_id, category_id) references categories(tenant_id, id)");
    expect(migration).toContain("foreign key (tenant_id, base_unit_id) references units(tenant_id, id)");
    expect(migration).toContain("foreign key (tenant_id, bulk_unit_id) references units(tenant_id, id)");
    expect(migration).toContain("foreign key (tenant_id, product_id) references products(tenant_id, id)");
    expect(migration).toContain("foreign key (tenant_id, created_by) references users(tenant_id, id)");
  });

  it("adds grosir data constraints and indexes", () => {
    const migration = sql();

    expect(migration).toContain("unique (tenant_id, sku)");
    expect(migration).toContain("check (bulk_conversion is null or bulk_conversion > 1)");
    expect(migration).toContain("check ((bulk_unit_id is null and bulk_conversion is null) or (bulk_unit_id is not null and bulk_conversion is not null))");
    expect(migration).toContain("check (buy_price >= 0)");
    expect(migration).toContain("check (sell_price_eceran >= 0)");
    expect(migration).toContain("check (sell_price_grosir >= 0)");
    expect(migration).toContain("check (status in ('pending','processing','done','failed'))");
    expect(migration).toContain("metadata jsonb not null default '{}'");
    expect(migration).toContain("create index notifications_tenant_unread_idx on notifications (tenant_id, is_read, created_at)");
    expect(migration).toContain("create unique index notifications_unread_low_stock_product_idx");
    expect(migration).toContain("where type = 'low_stock' and is_read = false and metadata ? 'product_id'");
    expect(migration).toContain("create index export_jobs_tenant_status_idx on export_jobs (tenant_id, status, created_at)");
  });
});
