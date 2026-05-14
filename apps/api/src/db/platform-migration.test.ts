import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const platformMigrationPath = resolve(__dirname, "../../../../db/migrations/001_platform.sql");

describe("001 platform migration", () => {
  const sql = () => readFileSync(platformMigrationPath, "utf8");

  it("enables pgcrypto and defines the uuid_v7 helper", () => {
    const migration = sql();

    expect(migration).toContain("create extension if not exists pgcrypto");
    expect(migration).toContain("create or replace function uuid_v7() returns uuid");
    expect(migration).toContain("gen_random_uuid()");
  });

  it("creates platform tables with platform-scope columns and constraints", () => {
    const migration = sql();

    expect(migration).toContain("create table platform_admins");
    expect(migration).toContain("email         text unique not null");
    expect(migration).toContain("password_hash text not null");
    expect(migration).toContain("create table tenants");
    expect(migration).toContain("slug       text unique not null");
    expect(migration).toContain("sector     text not null check (sector in ('grosir','retail','fnb','jasa','apotek'))");
    expect(migration).toContain("status     text not null default 'active' check (status in ('active','suspended'))");
    expect(migration).toContain("settings   jsonb not null default '{}'");
    expect(migration).toContain("create table platform_audit_log");
    expect(migration).toContain("admin_id   uuid references platform_admins(id)");
    expect(migration).toContain("meta       jsonb not null default '{}'");
  });
});
