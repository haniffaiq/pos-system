import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import type { AppError } from "../../lib/errors";
import { adminPool, tenantPool } from "../../db/pool";
import { withAdmin } from "../../db/withTenant";
import { createSale } from "./sales.service";
import { recordMovement } from "./stock";
import { getExportDownload, requestExport, salesReport, stockReport } from "./reports.service";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface ReportsFixture {
  tenantId: string;
  otherTenantId: string;
  userId: string;
  productId: string;
}

async function createReportsFixture(label: string): Promise<ReportsFixture> {
  const suffix = crypto.randomUUID().slice(0, 8);
  return withAdmin(async (q) => {
    const tenant = await q<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      [`${label} ${suffix}`, `${label.toLowerCase()}-${suffix}`],
    );
    const otherTenant = await q<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      [`${label} Other ${suffix}`, `${label.toLowerCase()}-other-${suffix}`],
    );
    const tenantId = tenant.rows[0]!.id;
    const otherTenantId = otherTenant.rows[0]!.id;
    const user = await q<{ id: string }>(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'Owner', 'owner') returning id",
      [tenantId, `owner-${suffix}@reports.test`],
    );
    const unit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'pcs') returning id", [tenantId]);
    const product = await q<{ id: string }>(
      `insert into products(
        tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty
      ) values ($1, $2, 'Mie', $3, 2500, 3000, 34000, 10, 0) returning id`,
      [tenantId, `REP-${suffix}`, unit.rows[0]!.id],
    );

    return { tenantId, otherTenantId, userId: user.rows[0]!.id, productId: product.rows[0]!.id };
  });
}

describeWithDatabase("reports service", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("summarizes tenant sales in a date range and keeps other tenants isolated", async () => {
    const fixture = await createReportsFixture("ReportsSales");
    await recordMovementForTenant(fixture.tenantId, fixture.productId, 100);
    await createSale(fixture.tenantId, fixture.userId, {
      paymentMethod: "cash",
      paid: 30_000,
      items: [{ productId: fixture.productId, unitType: "eceran", qty: 4 }],
    });

    const report = await salesReport(fixture.tenantId, { from: "2000-01-01", to: "2999-01-01" });
    const otherTenantReport = await salesReport(fixture.otherTenantId, { from: "2000-01-01", to: "2999-01-01" });

    expect(report.grandTotal).toBe(12_000);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ total: 12_000, payment_method: "cash" });
    expect(otherTenantReport).toEqual({ rows: [], grandTotal: 0 });
  });

  it("lists tenant stock balances", async () => {
    const fixture = await createReportsFixture("ReportsStock");
    await recordMovementForTenant(fixture.tenantId, fixture.productId, 100);
    await createSale(fixture.tenantId, fixture.userId, {
      paymentMethod: "cash",
      paid: 30_000,
      items: [{ productId: fixture.productId, unitType: "eceran", qty: 4 }],
    });

    const report = await stockReport(fixture.tenantId, { from: "2000-01-01", to: "2999-01-01" });

    expect(report).toContainEqual(expect.objectContaining({ product_id: fixture.productId, stock_qty: 96, min_stock: 10 }));
  });

  it("creates a pending export job and enqueues export generation", async () => {
    const fixture = await createReportsFixture("ReportsExport");

    const job = await requestExport(fixture.tenantId, fixture.userId, "sales", { from: "2000-01-01", to: "2999-01-01" });

    expect(job).toMatchObject({ type: "sales", status: "pending", file_path: null });
    const stored = await withAdmin(async (q) => {
      const row = await q<{ params: { from: string; to: string }; created_by: string }>(
        "select params, created_by from export_jobs where tenant_id = $1 and id = $2",
        [fixture.tenantId, job.id],
      );
      return row.rows[0]!;
    });
    expect(stored.params).toEqual({ from: "2000-01-01", to: "2999-01-01" });
    expect(stored.created_by).toBe(fixture.userId);
  });

  it("rejects done export downloads whose file path resolves outside the tenant export directory", async () => {
    const fixture = await createReportsFixture("ReportsTraversal");
    const exportRoot = mkdtempSync(join(tmpdir(), "exports-root-"));
    const outsidePath = join(mkdtempSync(join(tmpdir(), "exports-outside-")), "hosts.csv");
    writeFileSync(outsidePath, "not,a,tenant,export\n", "utf8");
    process.env.EXPORT_DIR = exportRoot;

    const job = await withAdmin(async (q) => {
      const row = await q<{ id: string }>(
        `insert into export_jobs(tenant_id, type, status, file_path, params, created_by)
         values ($1, 'sales', 'done', $2, '{}'::jsonb, $3)
         returning id`,
        [fixture.tenantId, outsidePath, fixture.userId],
      );
      return row.rows[0]!;
    });

    await expect(getExportDownload(fixture.tenantId, job.id)).rejects.toMatchObject({
      status: 409,
      code: "unsafe_export_path",
    } satisfies Partial<AppError>);
  });
});

async function recordMovementForTenant(tenantId: string, productId: string, qtyBase: number): Promise<void> {
  await import("../../db/withTenant").then(({ withTenant }) =>
    withTenant(tenantId, (q) => recordMovement(q, { productId, type: "in", refId: productId, qtyBase })),
  );
}
