import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const signupTokensMigrationPath = resolve(__dirname, "../../../../db/migrations/005_signup_tokens.sql");

describe("005 signup tokens migration", () => {
  const sql = () => readFileSync(signupTokensMigrationPath, "utf8");

  it("creates pre-auth signup token records for pending tenant bootstrap payloads", () => {
    const migration = sql();

    expect(migration).toContain("create table if not exists signup_tokens");
    expect(migration).toContain("token text primary key");
    expect(migration).toContain("email text not null");
    expect(migration).toContain("payload jsonb not null");
    expect(migration).toContain("expires_at timestamptz not null");
    expect(migration).toContain("consumed_at timestamptz");
  });

  it("keeps lookup and cleanup paths efficient for token validation and rate-limit checks", () => {
    const migration = sql();

    expect(migration).toContain("create index if not exists idx_signup_tokens_expiry");
    expect(migration).toContain("on signup_tokens(expires_at)");
    expect(migration).toContain("create index if not exists idx_signup_tokens_email_active");
    expect(migration).toContain("on signup_tokens(lower(email), expires_at)");
    expect(migration).toContain("where consumed_at is null");
  });

  it("grants app access without tenant RLS because signup runs before authentication", () => {
    const migration = sql();

    expect(migration).toContain("grant select, insert, update, delete on signup_tokens to app");
    expect(migration).toContain("grant all on signup_tokens to app_admin");
    expect(migration).not.toContain("enable row level security");
  });
});
