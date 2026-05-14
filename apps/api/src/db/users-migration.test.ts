import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const usersMigrationPath = resolve(__dirname, "../../../../db/migrations/002_users_rls.sql");
const devSeedPath = resolve(__dirname, "../../../../db/seeds/dev_seed.sql");

describe("002 users RLS migration", () => {
  const sql = () => readFileSync(usersMigrationPath, "utf8");

  it("creates app_admin as a login role that bypasses RLS", () => {
    const migration = sql();

    expect(migration).toContain("create role app_admin login password 'admin_dev_pw' bypassrls");
    expect(migration).toContain("alter role app_admin with login password 'admin_dev_pw' bypassrls");
    expect(migration).toContain("grant all on all tables in schema public to app_admin");
    expect(migration).toContain("alter default privileges in schema public grant all on tables to app_admin");
  });

  it("creates a tenant-scoped users table with tenant-local email uniqueness", () => {
    const migration = sql();

    expect(migration).toContain("create table users");
    expect(migration).toContain("tenant_id     uuid not null references tenants(id) on delete cascade");
    expect(migration).toContain("role          text not null check (role in ('owner','manager','cashier'))");
    expect(migration).toContain("status        text not null default 'active' check (status in ('active','suspended'))");
    expect(migration).toContain("unique (tenant_id, email)");
  });

  it("enables RLS and protects reads and writes with the tenant context", () => {
    const migration = sql();

    expect(migration).toContain("alter table users enable row level security");
    expect(migration).toContain("create policy users_tenant_isolation on users");
    expect(migration).toContain("using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)");
    expect(migration).toContain("with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)");
    expect(migration).toContain("grant select, insert, update, delete on users to app");
  });
});

describe("dev seed", () => {
  it("documents the local platform admin seed intent without committing a placeholder password hash", () => {
    const seed = readFileSync(devSeedPath, "utf8");

    expect(seed).toContain("admin@local");
    expect(seed).not.toContain("<hash>");
  });
});
