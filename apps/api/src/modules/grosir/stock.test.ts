import { afterAll, describe, expect, it } from "vitest";
import { adminPool, tenantPool } from "../../db/pool";
import { withAdmin, withTenant } from "../../db/withTenant";
import { AppError } from "../../lib/errors";
import { recordMovement } from "./stock";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;

const describeWithDatabase = databaseUrl && databaseAdminUrl ? describe : describe.skip;

interface ProductFixture {
  tenantId: string;
  productId: string;
}

async function createProductFixture(initialStock = 0): Promise<ProductFixture> {
  const suffix = crypto.randomUUID().slice(0, 8);
  return withAdmin(async (q) => {
    const tenant = await q<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      [`StockCo ${suffix}`, `stockco-${suffix}`],
    );
    const tenantId = tenant.rows[0]!.id;

    const unit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'pcs') returning id", [
      tenantId,
    ]);

    const product = await q<{ id: string }>(
      `insert into products(
        tenant_id, sku, name, base_unit_id, buy_price,
        sell_price_eceran, sell_price_grosir, min_stock, stock_qty
      ) values ($1, $2, 'Product', $3, 100, 150, 1400, 3, $4) returning id`,
      [tenantId, `SKU-${suffix}`, unit.rows[0]!.id, initialStock],
    );

    return { tenantId, productId: product.rows[0]!.id };
  });
}

describeWithDatabase("recordMovement", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("increments stock, writes a movement row, and returns the new balance", async () => {
    const { tenantId, productId } = await createProductFixture();

    const balance = await withTenant(tenantId, (q) =>
      recordMovement(q, { productId, type: "in", refId: productId, qtyBase: 20 }),
    );

    expect(balance).toBe(20);
    const stored = await withAdmin(async (q) => {
      const product = await q<{ stock_qty: number }>("select stock_qty from products where id = $1", [productId]);
      const movement = await q<{ type: string; ref_id: string; qty_base: number; balance_after: number }>(
        "select type, ref_id, qty_base, balance_after from stock_movements where tenant_id = $1 and product_id = $2",
        [tenantId, productId],
      );
      return { product: product.rows[0]!, movement: movement.rows[0]! };
    });

    expect(stored.product.stock_qty).toBe(20);
    expect(stored.movement).toEqual({ type: "in", ref_id: productId, qty_base: 20, balance_after: 20 });
  });

  it("decrements stock on a negative movement", async () => {
    const { tenantId, productId } = await createProductFixture(20);

    const balance = await withTenant(tenantId, (q) =>
      recordMovement(q, { productId, type: "sale", refId: productId, qtyBase: -5 }),
    );

    expect(balance).toBe(15);
    await expect(
      withAdmin(async (q) => {
        const row = await q<{ stock_qty: number }>("select stock_qty from products where id = $1", [productId]);
        return row.rows[0]!.stock_qty;
      }),
    ).resolves.toBe(15);
  });

  it("rejects a movement that would drive stock negative", async () => {
    const { tenantId, productId } = await createProductFixture(3);

    await expect(
      withTenant(tenantId, (q) => recordMovement(q, { productId, type: "sale", refId: productId, qtyBase: -4 })),
    ).rejects.toMatchObject<AppError>({ status: 409, code: "insufficient_stock" });

    await expect(
      withAdmin(async (q) => {
        const row = await q<{ stock_qty: number }>("select stock_qty from products where id = $1", [productId]);
        return row.rows[0]!.stock_qty;
      }),
    ).resolves.toBe(3);
  });

  it("rejects a missing product", async () => {
    const { tenantId, productId } = await createProductFixture();
    const missingProductId = crypto.randomUUID();

    await expect(
      withTenant(tenantId, (q) =>
        recordMovement(q, { productId: missingProductId, type: "adjustment", refId: productId, qtyBase: 1 }),
      ),
    ).rejects.toMatchObject<AppError>({ status: 404, code: "product_not_found" });
  });
});
