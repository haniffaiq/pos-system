import { afterAll, describe, expect, it } from "vitest";

import { adminPool, tenantPool } from "../../db/pool";
import { withAdmin, withTenant } from "../../db/withTenant";
import { createSale } from "./sales.service";
import { recordMovement } from "./stock";
import { getDashboard } from "./dashboard.service";

const databaseUrl = process.env.DATABASE_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface DashboardFixture {
  tenantId: string;
  otherTenantId: string;
  cashierId: string;
  productId: string;
  topProductId: string;
}

async function createDashboardFixture(label: string): Promise<DashboardFixture> {
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
    const cashier = await q<{ id: string }>(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'Cashier', 'cashier') returning id",
      [tenantId, `cashier-${suffix}@pos.test`],
    );
    const baseUnit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'pcs') returning id", [
      tenantId,
    ]);
    const otherBaseUnit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'other-pcs') returning id", [
      otherTenantId,
    ]);
    const product = await q<{ id: string }>(
      `insert into products(tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty)
       values ($1, $2, 'Kopi', $3, 8000, 10000, 95000, 20, 0) returning id`,
      [tenantId, `P-${suffix}`, baseUnit.rows[0]!.id],
    );
    const topProduct = await q<{ id: string }>(
      `insert into products(tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty)
       values ($1, $2, 'Teh', $3, 5000, 7000, 65000, 2, 0) returning id`,
      [tenantId, `T-${suffix}`, baseUnit.rows[0]!.id],
    );
    await q(
      `insert into products(tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty)
       values ($1, $2, 'Tenant lain', $3, 1, 2, 3, 100, 1)`,
      [otherTenantId, `O-${suffix}`, otherBaseUnit.rows[0]!.id],
    );

    return {
      tenantId,
      otherTenantId,
      cashierId: cashier.rows[0]!.id,
      productId: product.rows[0]!.id,
      topProductId: topProduct.rows[0]!.id,
    };
  });
}

describeWithDatabase("dashboard service", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("reports today's sales total, transaction count, low stock count, and top products for the tenant only", async () => {
    const fixture = await createDashboardFixture("DashboardTenant");
    await recordMovementForTenant(fixture.tenantId, fixture.productId, 5);
    await recordMovementForTenant(fixture.tenantId, fixture.topProductId, 10);
    await createSale(fixture.tenantId, fixture.cashierId, {
      paymentMethod: "cash",
      paid: 50000,
      items: [
        { productId: fixture.productId, unitType: "eceran", qty: 2 },
        { productId: fixture.topProductId, unitType: "eceran", qty: 4 },
      ],
    });

    const dashboard = await getDashboard(fixture.tenantId);

    expect(dashboard.todaySalesTotal).toBe(48000);
    expect(dashboard.todayTxnCount).toBe(1);
    expect(dashboard.lowStockCount).toBe(1);
    expect(dashboard.topProducts).toEqual([
      { product_id: fixture.topProductId, name: "Teh", qty_sold: 4 },
      { product_id: fixture.productId, name: "Kopi", qty_sold: 2 },
    ]);

    expect(await getDashboard(fixture.otherTenantId)).toEqual({
      todaySalesTotal: 0,
      todayTxnCount: 0,
      lowStockCount: 1,
      topProducts: [],
    });
  });
});

async function recordMovementForTenant(tenantId: string, productId: string, qtyBase: number) {
  await withTenant(tenantId, (q) => recordMovement(q, { productId, type: "in", refId: productId, qtyBase }));
}
