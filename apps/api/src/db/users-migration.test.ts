import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const usersMigrationPath = resolve(__dirname, "../../../../db/migrations/002_users_rls.sql");
const devSeedPath = resolve(__dirname, "../../../../db/seeds/dev_seed.sql");

describe("002 users RLS migration", () => {
  const sql = () => readFileSync(usersMigrationPath, "utf8");

  it("does not provision cluster-global roles (shared instance owner does that)", () => {
    const migration = sql();

    expect(migration).not.toContain("create role");
    expect(migration).not.toContain("app_admin");
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
    expect(migration).toContain("alter table users force row level security");
    expect(migration).toContain("create policy users_tenant_isolation on users");
    expect(migration).toContain("current_setting('app.platform_mode', true) = 'on'");
    expect(migration).toContain("or tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid");
    expect(migration).not.toContain("to app");
  });
});

describe("dev seed", () => {
  it("documents the local platform admin seed intent without committing a placeholder password hash", () => {
    const seed = readFileSync(devSeedPath, "utf8");

    expect(seed).toContain("admin@local");
    expect(seed).not.toContain("<hash>");
  });
});
