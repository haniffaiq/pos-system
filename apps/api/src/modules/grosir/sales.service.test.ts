import { afterAll, describe, expect, it } from "vitest";

import { adminPool, tenantPool } from "../../db/pool";
import { withAdmin } from "../../db/withTenant";
import { createSale, listSales } from "./sales.service";

const databaseUrl = process.env.DATABASE_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface SalesFixture {
  tenantId: string;
  otherTenantId: string;
  cashierId: string;
  productId: string;
  otherProductId: string;
}

async function createSalesFixture(label: string): Promise<SalesFixture> {
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
    const bulkUnit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'dus') returning id", [
      tenantId,
    ]);
    const otherBaseUnit = await q<{ id: string }>(
      "insert into units(tenant_id, name) values ($1, 'other-pcs') returning id",
      [otherTenantId],
    );
    const product = await q<{ id: string }>(
      `insert into products(tenant_id, sku, name, base_unit_id, bulk_unit_id, bulk_conversion,
         buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty)
       values ($1, $2, 'Gula', $3, $4, 10, 10000, 12000, 110000, 5, 100) returning id`,
      [tenantId, `P-${suffix}`, baseUnit.rows[0]!.id, bulkUnit.rows[0]!.id],
    );
    const otherProduct = await q<{ id: string }>(
      `insert into products(tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock)
       values ($1, $2, 'Tenant lain', $3, 1, 2, 3, 0) returning id`,
      [otherTenantId, `O-${suffix}`, otherBaseUnit.rows[0]!.id],
    );

    return {
      tenantId,
      otherTenantId,
      cashierId: cashier.rows[0]!.id,
      productId: product.rows[0]!.id,
      otherProductId: otherProduct.rows[0]!.id,
    };
  });
}

describeWithDatabase("sales service", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("creates a sale, computes totals/change, stores cashier quantities, and decrements stock", async () => {
    const fixture = await createSalesFixture("SalesCreate");

    const sale = await createSale(fixture.tenantId, fixture.cashierId, {
      customerName: "Bu Ani",
      paymentMethod: "cash",
      paid: 200000,
      items: [
        { productId: fixture.productId, unitType: "grosir", qty: 1 },
        { productId: fixture.productId, unitType: "eceran", qty: 3 },
      ],
    });

    expect(sale).toMatchObject({
      customer_name: "Bu Ani",
      total: 146000,
      paid: 200000,
      change: 54000,
      payment_method: "cash",
    });
    expect(sale.invoice_no).toMatch(/^INV-\d{8}-\d{4}$/);

    const product = await adminPool.query<{ stock_qty: number }>("select stock_qty from products where id = $1", [
      fixture.productId,
    ]);
    expect(product.rows[0]!.stock_qty).toBe(87);

    const items = await adminPool.query<{ unit_type: string; qty: number; unit_price: string; subtotal: string }>(
      "select unit_type, qty, unit_price, subtotal from sale_items where sale_id = $1 order by unit_type",
      [sale.id],
    );
    expect(items.rows).toEqual([
      { unit_type: "eceran", qty: 3, unit_price: "12000", subtotal: "36000" },
      { unit_type: "grosir", qty: 1, unit_price: "110000", subtotal: "110000" },
    ]);
  });

  it("persists non-cash payment methods accepted by the sale schema", async () => {
    const fixture = await createSalesFixture("SalesQris");

    const sale = await createSale(fixture.tenantId, fixture.cashierId, {
      paymentMethod: "qris",
      paid: 12000,
      items: [{ productId: fixture.productId, unitType: "eceran", qty: 1 }],
    });

    expect(sale.payment_method).toBe("qris");
  });

  it("rejects insufficient payment before writing sale rows", async () => {
    const fixture = await createSalesFixture("SalesPaid");

    await expect(
      createSale(fixture.tenantId, fixture.cashierId, {
        paymentMethod: "cash",
        paid: 100,
        items: [{ productId: fixture.productId, unitType: "eceran", qty: 1 }],
      }),
    ).rejects.toMatchObject({ status: 400, code: "insufficient_payment" });

    const sales = await listSales(fixture.tenantId, {});
    expect(sales).toEqual([]);
  });

  it("rejects insufficient stock and rolls the transaction back", async () => {
    const fixture = await createSalesFixture("SalesStock");

    await expect(
      createSale(fixture.tenantId, fixture.cashierId, {
        paymentMethod: "cash",
        paid: 200000000,
        items: [{ productId: fixture.productId, unitType: "grosir", qty: 999 }],
      }),
    ).rejects.toMatchObject({ status: 409, code: "insufficient_stock" });

    const product = await adminPool.query<{ stock_qty: number }>("select stock_qty from products where id = $1", [
      fixture.productId,
    ]);
    expect(product.rows[0]!.stock_qty).toBe(100);
    expect(await listSales(fixture.tenantId, {})).toEqual([]);
  });

  it("lists sales newest first inside the current tenant only", async () => {
    const fixture = await createSalesFixture("SalesList");
    await createSale(fixture.tenantId, fixture.cashierId, {
      paymentMethod: "cash",
      paid: 12000,
      items: [{ productId: fixture.productId, unitType: "eceran", qty: 1 }],
    });
    await createSale(fixture.tenantId, fixture.cashierId, {
      paymentMethod: "cash",
      paid: 24000,
      items: [{ productId: fixture.productId, unitType: "eceran", qty: 2 }],
    });

    const sales = await listSales(fixture.tenantId, {});
    expect(sales).toHaveLength(2);
    expect(sales[0]!.total).toBe(24000);
    expect(sales[1]!.total).toBe(12000);
    expect(await listSales(fixture.otherTenantId, {})).toEqual([]);
  });

  it("rejects products outside the tenant", async () => {
    const fixture = await createSalesFixture("SalesTenantRefs");

    await expect(
      createSale(fixture.tenantId, fixture.cashierId, {
        paymentMethod: "cash",
        paid: 1000,
        items: [{ productId: fixture.otherProductId, unitType: "eceran", qty: 1 }],
      }),
    ).rejects.toMatchObject({ status: 404, code: "product_not_found" });
  });
});
