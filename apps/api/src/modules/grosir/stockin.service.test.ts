import { afterAll, describe, expect, it } from "vitest";

import { adminPool, tenantPool } from "../../db/pool";
import { withAdmin } from "../../db/withTenant";
import { createStockIn, listStockIn } from "./stockin.service";

const databaseUrl = process.env.DATABASE_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface StockInFixture {
  tenantId: string;
  otherTenantId: string;
  userId: string;
  supplierId: string;
  baseUnitId: string;
  bulkUnitId: string;
  productId: string;
  otherUnitId: string;
}

async function createStockInFixture(label: string): Promise<StockInFixture> {
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
      [tenantId, `owner-${suffix}@stockin.test`],
    );
    const supplier = await q<{ id: string }>("insert into suppliers(tenant_id, name) values ($1, 'Supplier') returning id", [
      tenantId,
    ]);
    const baseUnit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'pcs') returning id", [
      tenantId,
    ]);
    const bulkUnit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'dus') returning id", [
      tenantId,
    ]);
    const otherUnit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'box') returning id", [
      otherTenantId,
    ]);
    const product = await q<{ id: string }>(
      `insert into products(
        tenant_id, sku, name, base_unit_id, bulk_unit_id, bulk_conversion,
        buy_price, sell_price_eceran, sell_price_grosir, min_stock
      ) values ($1, $2, 'Minyak', $3, $4, 12, 15000, 17000, 190000, 6) returning id`,
      [tenantId, `OIL-${suffix}`, baseUnit.rows[0]!.id, bulkUnit.rows[0]!.id],
    );

    return {
      tenantId,
      otherTenantId,
      userId: user.rows[0]!.id,
      supplierId: supplier.rows[0]!.id,
      baseUnitId: baseUnit.rows[0]!.id,
      bulkUnitId: bulkUnit.rows[0]!.id,
      productId: product.rows[0]!.id,
      otherUnitId: otherUnit.rows[0]!.id,
    };
  });
}

describeWithDatabase("stock-in service", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("creates a stock-in atomically, converts units to base quantity, and lists it for the tenant", async () => {
    const fixture = await createStockInFixture("StockInCreate");

    const created = await createStockIn(fixture.tenantId, fixture.userId, {
      supplierId: fixture.supplierId,
      note: "first delivery",
      items: [
        { productId: fixture.productId, unitId: fixture.bulkUnitId, qty: 2, unitCost: 180000 },
        { productId: fixture.productId, unitId: fixture.baseUnitId, qty: 5, unitCost: 15000 },
      ],
    });

    expect(created).toMatchObject({ supplier_id: fixture.supplierId, note: "first delivery", total_cost: 435000 });
    const stored = await withAdmin(async (q) => {
      const product = await q<{ stock_qty: number }>("select stock_qty from products where id = $1", [fixture.productId]);
      const items = await q<{ qty: number; unit_cost: number; subtotal: number }>(
        "select qty, unit_cost::integer as unit_cost, subtotal::integer as subtotal from stock_in_items where tenant_id = $1 and stock_in_id = $2 order by qty desc",
        [fixture.tenantId, created.id],
      );
      const movements = await q<{ qty_base: number; balance_after: number }>(
        "select qty_base, balance_after from stock_movements where tenant_id = $1 and ref_id = $2 order by id",
        [fixture.tenantId, created.id],
      );
      return { product: product.rows[0]!, items: items.rows, movements: movements.rows };
    });

    expect(stored.product.stock_qty).toBe(29);
    expect(stored.items).toEqual([
      { qty: 5, unit_cost: 15000, subtotal: 75000 },
      { qty: 2, unit_cost: 180000, subtotal: 360000 },
    ]);
    expect(stored.movements).toEqual([
      { qty_base: 24, balance_after: 24 },
      { qty_base: 5, balance_after: 29 },
    ]);
    await expect(listStockIn(fixture.tenantId)).resolves.toContainEqual(created);
    await expect(listStockIn(fixture.otherTenantId)).resolves.toEqual([]);
  });

  it("rolls back the header, items, movements, and stock when one line uses an invalid unit", async () => {
    const fixture = await createStockInFixture("StockInRollback");

    await expect(
      createStockIn(fixture.tenantId, fixture.userId, {
        items: [
          { productId: fixture.productId, unitId: fixture.baseUnitId, qty: 1, unitCost: 15000 },
          { productId: fixture.productId, unitId: fixture.otherUnitId, qty: 1, unitCost: 15000 },
        ],
      }),
    ).rejects.toMatchObject({ status: 400, code: "bad_unit" });

    const stored = await withAdmin(async (q) => {
      const product = await q<{ stock_qty: number }>("select stock_qty from products where id = $1", [fixture.productId]);
      const headers = await q<{ count: string }>("select count(*) from stock_in where tenant_id = $1", [fixture.tenantId]);
      const movements = await q<{ count: string }>("select count(*) from stock_movements where tenant_id = $1", [fixture.tenantId]);
      return { stockQty: product.rows[0]!.stock_qty, headers: Number(headers.rows[0]!.count), movements: Number(movements.rows[0]!.count) };
    });

    expect(stored).toEqual({ stockQty: 0, headers: 0, movements: 0 });
  });
});
