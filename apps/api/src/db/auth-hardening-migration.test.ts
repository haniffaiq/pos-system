import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authHardeningMigrationPath = resolve(__dirname, "../../../../db/migrations/004_auth_hardening.sql");

describe("004 auth hardening migration", () => {
  const sql = () => readFileSync(authHardeningMigrationPath, "utf8");

  it("creates tenant-user MFA enrollment records with method constraints and encrypted secrets", () => {
    const migration = sql();

    expect(migration).toContain("create table if not exists user_mfa");
    expect(migration).toContain("user_id uuid not null references users(id) on delete cascade");
    expect(migration).toContain("method text not null check (method in ('totp','email_otp'))");
    expect(migration).toContain("secret_encrypted text");
    expect(migration).toContain("enabled boolean not null default false");
    expect(migration).toContain("primary key (user_id, method)");
  });

  it("supports platform-admin MFA without tenant user rows", () => {
    const migration = sql();

    expect(migration).toContain("create table if not exists platform_admin_mfa");
    expect(migration).toContain("admin_id uuid not null references platform_admins(id) on delete cascade");
    expect(migration).toContain("primary key (admin_id, method)");
  });

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

  it("creates a durable refresh token blacklist for cookie logout revocation", () => {
    const migration = sql();

    expect(migration).toContain("create table if not exists refresh_token_blacklist");
    expect(migration).toContain("jti text primary key");
    expect(migration).toContain("user_id uuid");
    expect(migration).toContain("admin_id uuid");
    expect(migration).toContain("revoked_at timestamptz not null default now()");
    expect(migration).toContain("expires_at timestamptz not null");
    expect(migration).toContain("reason text not null default 'logout'");
    expect(migration).toContain("check ((user_id is not null)::int + (admin_id is not null)::int = 1)");
    expect(migration).toContain("create index if not exists idx_refresh_blacklist_expiry");
  });
});
