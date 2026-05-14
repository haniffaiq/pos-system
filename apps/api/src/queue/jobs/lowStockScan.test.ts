import { afterAll, describe, expect, it } from "vitest";
import type { Job } from "bullmq";

import { adminPool, tenantPool } from "../../db/pool";
import { lowStockProcessor } from "./lowStockScan";
import type { LowStockScanJob } from "../queues";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;
const describeWithDatabase = databaseUrl && databaseAdminUrl ? describe : describe.skip;

async function createTenantWithProducts(slugPrefix: string): Promise<{
  tenantId: string;
  lowProductId: string;
  equalProductId: string;
  inactiveProductId: string;
  otherProductId: string;
}> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenant = await adminPool.query<{ id: string }>(
    "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
    [`${slugPrefix} ${suffix}`, `${slugPrefix.toLowerCase()}-${suffix}`],
  );
  const tenantId = tenant.rows[0]!.id;
  const unit = await adminPool.query<{ id: string }>(
    "insert into units(tenant_id, name) values ($1, 'pcs') returning id",
    [tenantId],
  );
  const products = await adminPool.query<{
    id: string;
    sku: string;
  }>(
    `insert into products(tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty, is_active)
     values
       ($1, $2, 'Sabun', $6, 1, 1, 1, 10, 2, true),
       ($1, $3, 'Gula', $6, 1, 1, 1, 5, 5, true),
       ($1, $4, 'Nonaktif', $6, 1, 1, 1, 10, 1, false),
       ($1, $5, 'Pasta', $6, 1, 1, 1, 5, 50, true)
     returning id, sku`,
    [tenantId, `LOW-${suffix}`, `EQ-${suffix}`, `OFF-${suffix}`, `OK-${suffix}`, unit.rows[0]!.id],
  );

  const bySku = new Map(products.rows.map((row) => [row.sku, row.id]));
  return {
    tenantId,
    lowProductId: bySku.get(`LOW-${suffix}`)!,
    equalProductId: bySku.get(`EQ-${suffix}`)!,
    inactiveProductId: bySku.get(`OFF-${suffix}`)!,
    otherProductId: bySku.get(`OK-${suffix}`)!,
  };
}

describeWithDatabase("low-stock scan processor", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("creates tenant-scoped notifications for active products at or below min_stock", async () => {
    const tenantA = await createTenantWithProducts("LowScanA");
    const tenantB = await createTenantWithProducts("LowScanB");

    await lowStockProcessor({ data: {} } as Job<LowStockScanJob>);

    const notifications = await adminPool.query<{
      tenant_id: string;
      title: string;
      body: string | null;
      metadata: { product_id: string; stock_qty: number; min_stock: number };
    }>(
      `select tenant_id, title, body, metadata
         from notifications
        where type = 'low_stock' and tenant_id = any($1::uuid[])
        order by tenant_id, body`,
      [[tenantA.tenantId, tenantB.tenantId]],
    );

    expect(notifications.rowCount).toBe(4);
    expect(notifications.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenant_id: tenantA.tenantId,
          title: "Stok menipis",
          body: expect.stringContaining("Sabun"),
          metadata: expect.objectContaining({ product_id: tenantA.lowProductId, stock_qty: 2, min_stock: 10 }),
        }),
        expect.objectContaining({
          tenant_id: tenantA.tenantId,
          body: expect.stringContaining("Gula"),
          metadata: expect.objectContaining({ product_id: tenantA.equalProductId, stock_qty: 5, min_stock: 5 }),
        }),
        expect.objectContaining({
          tenant_id: tenantB.tenantId,
          metadata: expect.objectContaining({ product_id: tenantB.lowProductId }),
        }),
        expect.objectContaining({
          tenant_id: tenantB.tenantId,
          metadata: expect.objectContaining({ product_id: tenantB.equalProductId }),
        }),
      ]),
    );
    expect(notifications.rows.map((row) => row.metadata.product_id)).not.toContain(tenantA.inactiveProductId);
    expect(notifications.rows.map((row) => row.metadata.product_id)).not.toContain(tenantA.otherProductId);
  });

  it("dedupes unread notifications by metadata product_id across retries, not body text", async () => {
    const tenant = await createTenantWithProducts("LowRetry");
    await adminPool.query(
      `insert into notifications(tenant_id, type, title, body, metadata, is_read)
       values
         ($1, 'low_stock', 'Old product name', 'Sabun', jsonb_build_object('product_id', $2::text), false),
         ($1, 'low_stock', 'Read notification', 'Gula', jsonb_build_object('product_id', $3::text), true)`,
      [tenant.tenantId, tenant.lowProductId, tenant.equalProductId],
    );

    await lowStockProcessor({ data: {} } as Job<LowStockScanJob>);
    await lowStockProcessor({ data: {} } as Job<LowStockScanJob>);

    const notifications = await adminPool.query<{ product_id: string; is_read: boolean }>(
      `select metadata->>'product_id' as product_id, is_read
         from notifications
        where tenant_id = $1 and type = 'low_stock'
        order by created_at, id`,
      [tenant.tenantId],
    );

    expect(notifications.rows.filter((row) => row.product_id === tenant.lowProductId && !row.is_read)).toHaveLength(1);
    expect(notifications.rows.filter((row) => row.product_id === tenant.equalProductId && !row.is_read)).toHaveLength(1);
    expect(notifications.rows.filter((row) => row.product_id === tenant.equalProductId && row.is_read)).toHaveLength(1);
  });
});
