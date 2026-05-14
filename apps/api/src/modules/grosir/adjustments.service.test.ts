import { afterAll, describe, expect, it } from "vitest";

import { adminPool, tenantPool } from "../../db/pool";
import { withAdmin, withTenant } from "../../db/withTenant";
import type { AppError } from "../../lib/errors";
import { createAdjustment, listAdjustments } from "./adjustments.service";
import { recordMovement } from "./stock";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;

const describeWithDatabase = databaseUrl && databaseAdminUrl ? describe : describe.skip;

interface AdjustmentFixture {
  tenantId: string;
  otherTenantId: string;
  userId: string;
  productId: string;
}

async function createAdjustmentFixture(label: string): Promise<AdjustmentFixture> {
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
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'Manager', 'manager') returning id",
      [tenantId, `manager-${suffix}@adj.test`],
    );
    const unit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'pcs') returning id", [
      tenantId,
    ]);
    const product = await q<{ id: string }>(
      `insert into products(tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock)
       values ($1, $2, 'Telur', $3, 2000, 2500, 28000, 10) returning id`,
      [tenantId, `P-ADJ-${suffix}`, unit.rows[0]!.id],
    );

    return {
      tenantId,
      otherTenantId,
      userId: user.rows[0]!.id,
      productId: product.rows[0]!.id,
    };
  });
}

describeWithDatabase("adjustments service", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("applies a signed adjustment, writes a movement, and lists it inside the tenant", async () => {
    const fixture = await createAdjustmentFixture("AdjustmentsApply");
    await withTenant(fixture.tenantId, (q) =>
      recordMovement(q, { productId: fixture.productId, type: "in", refId: fixture.productId, qtyBase: 50 }),
    );

    const adjustment = await createAdjustment(fixture.tenantId, fixture.userId, {
      productId: fixture.productId,
      qtyBase: -8,
      reason: "rusak",
      note: "pecah saat bongkar",
    });

    expect(adjustment).toMatchObject({
      product_id: fixture.productId,
      qty_base: -8,
      reason: "rusak",
      note: "pecah saat bongkar",
    });
    const state = await withAdmin(async (q) => {
      const product = await q<{ stock_qty: number }>("select stock_qty from products where id = $1", [fixture.productId]);
      const movement = await q<{ qty_base: number; balance_after: number; ref_id: string }>(
        "select qty_base, balance_after, ref_id from stock_movements where type = 'adjustment' and product_id = $1",
        [fixture.productId],
      );
      return { product: product.rows[0]!, movement: movement.rows[0]! };
    });
    expect(state.product.stock_qty).toBe(42);
    expect(state.movement).toEqual({ qty_base: -8, balance_after: 42, ref_id: adjustment.id });

    expect(await listAdjustments(fixture.tenantId)).toContainEqual(adjustment);
    expect(await listAdjustments(fixture.otherTenantId)).not.toContainEqual(expect.objectContaining({ id: adjustment.id }));
  });

  it("rolls back the adjustment row when the signed movement would make stock negative", async () => {
    const fixture = await createAdjustmentFixture("AdjustmentsRollback");

    await expect(
      createAdjustment(fixture.tenantId, fixture.userId, {
        productId: fixture.productId,
        qtyBase: -1,
        reason: "hilang",
      }),
    ).rejects.toMatchObject<AppError>({ status: 409, code: "insufficient_stock" });

    const count = await withAdmin(async (q) =>
      q<{ count: string }>("select count(*)::text as count from stock_adjustments where product_id = $1", [fixture.productId]),
    );
    expect(count.rows[0]!.count).toBe("0");
  });
});
