import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const billingMigrationPath = resolve(__dirname, "../../../../db/migrations/006_billing.sql");

describe("006 billing migration", () => {
  const sql = () => readFileSync(billingMigrationPath, "utf8");

  it("creates provider-neutral plans, subscriptions, and invoices tables", () => {
    const migration = sql();

    expect(migration).toContain("create table plans");
    expect(migration).toContain("code text unique not null");
    expect(migration).toContain("quota jsonb not null");
    expect(migration).toContain("create table subscriptions");
    expect(migration).toContain("tenant_id uuid not null references tenants(id) on delete cascade");
    expect(migration).toContain("plan_id uuid not null references plans(id)");
    expect(migration).toContain("psp_provider text");
    expect(migration).toContain("psp_subscription_id text");
    expect(migration).toContain("create table invoices");
    expect(migration).toContain("psp_provider text not null");
    expect(migration).toContain("psp_order_id text unique not null");
    expect(migration).toContain("psp_transaction_id text");
    expect(migration).toContain("payment_method text");
    expect(migration).toContain("due_at timestamptz not null");
    expect(migration).toContain("paid_at timestamptz");
    expect(migration).not.toMatch(/midtrans_order_id|xendit_invoice_id/);
  });

  it("adds status checks, indexes, and tenant-safe invoice relationships", () => {
    const migration = sql();

    expect(migration).toContain("check (status in ('trialing','active','past_due','suspended','canceled'))");
    expect(migration).toContain("check (status in ('pending','paid','failed','expired','refunded'))");
    expect(migration).toContain("unique (tenant_id, id)");
    expect(migration).toContain("foreign key (tenant_id, subscription_id) references subscriptions(tenant_id, id) on delete cascade");
    expect(migration).toContain("create index subscriptions_tenant_active_idx on subscriptions (tenant_id) where status in ('trialing','active')");
    expect(migration).toContain("create index invoices_tenant_pending_idx on invoices (tenant_id, status, due_at)");
    expect(migration).toContain("create index invoices_psp_provider_order_idx on invoices (psp_provider, psp_order_id)");
  });

  it("protects tenant-owned billing tables with RLS", () => {
    const migration = sql();

    expect(migration).not.toContain("to app");
    expect(migration).toContain("select apply_tenant_rls('subscriptions')");
    expect(migration).toContain("select apply_tenant_rls('invoices')");
    expect(migration).toContain("select apply_tenant_rls('usage_counters')");
  });
});
