import { afterAll, describe, expect, it } from "vitest";

import { adminPool, tenantPool } from "../../db/pool";
import { withAdmin } from "../../db/withTenant";
import type { AppError } from "../../lib/errors";
import { createProduct, getProduct, listProducts, setProductActive, updateProduct } from "./products.service";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;

const describeWithDatabase = databaseUrl && databaseAdminUrl ? describe : describe.skip;

interface ProductFixture {
  tenantId: string;
  otherTenantId: string;
  categoryId: string;
  baseUnitId: string;
  bulkUnitId: string;
  otherCategoryId: string;
  otherUnitId: string;
}

async function createProductFixture(label: string): Promise<ProductFixture> {
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
    const category = await q<{ id: string }>("insert into categories(tenant_id, name) values ($1, 'Beras') returning id", [
      tenantId,
    ]);
    const baseUnit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'pcs') returning id", [
      tenantId,
    ]);
    const bulkUnit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'dus') returning id", [
      tenantId,
    ]);
    const otherCategory = await q<{ id: string }>(
      "insert into categories(tenant_id, name) values ($1, 'Cross') returning id",
      [otherTenantId],
    );
    const otherUnit = await q<{ id: string }>("insert into units(tenant_id, name) values ($1, 'box') returning id", [
      otherTenantId,
    ]);

    return {
      tenantId,
      otherTenantId,
      categoryId: category.rows[0]!.id,
      baseUnitId: baseUnit.rows[0]!.id,
      bulkUnitId: bulkUnit.rows[0]!.id,
      otherCategoryId: otherCategory.rows[0]!.id,
      otherUnitId: otherUnit.rows[0]!.id,
    };
  });
}

describeWithDatabase("products service", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("creates, lists, fetches, updates, and toggles products inside one tenant", async () => {
    const fixture = await createProductFixture("ProductsCrud");
    await createProduct(fixture.otherTenantId, {
      sku: "BRS-1",
      name: "Tenant lain",
      baseUnitId: fixture.otherUnitId,
      buyPrice: 1,
      sellPriceEceran: 2,
      sellPriceGrosir: 3,
      minStock: 0,
    });

    const created = await createProduct(fixture.tenantId, {
      sku: "BRS-1",
      name: "Beras Premium",
      categoryId: fixture.categoryId,
      baseUnitId: fixture.baseUnitId,
      bulkUnitId: fixture.bulkUnitId,
      bulkConversion: 10,
      buyPrice: 12000,
      sellPriceEceran: 14000,
      sellPriceGrosir: 135000,
      minStock: 5,
    });

    expect(created.stock_qty).toBe(0);
    expect(created.is_active).toBe(true);
    expect(await listProducts(fixture.tenantId, { search: "premium", activeOnly: true })).toContainEqual(created);
    await expect(getProduct(fixture.tenantId, created.id)).resolves.toEqual(created);

    const updated = await updateProduct(fixture.tenantId, created.id, {
      sku: "BRS-2",
      name: "Beras Super",
      categoryId: fixture.categoryId,
      baseUnitId: fixture.baseUnitId,
      bulkUnitId: fixture.bulkUnitId,
      bulkConversion: 12,
      buyPrice: 12500,
      sellPriceEceran: 15000,
      sellPriceGrosir: 140000,
      minStock: 8,
    });
    expect(updated).toMatchObject({ sku: "BRS-2", sell_price_eceran: 15000, min_stock: 8, stock_qty: 0 });

    await setProductActive(fixture.tenantId, created.id, false);
    expect(await listProducts(fixture.tenantId, { activeOnly: true })).not.toContainEqual(
      expect.objectContaining({ id: created.id }),
    );
  });

  it("rejects duplicate sku inside the same tenant", async () => {
    const fixture = await createProductFixture("ProductsSku");
    const input = {
      sku: "SKU-1",
      name: "Gula",
      baseUnitId: fixture.baseUnitId,
      buyPrice: 1000,
      sellPriceEceran: 1200,
      sellPriceGrosir: 11000,
      minStock: 0,
    };

    await createProduct(fixture.tenantId, input);
    await expect(createProduct(fixture.tenantId, { ...input, name: "Gula lain" })).rejects.toMatchObject<AppError>({
      status: 409,
      code: "sku_taken",
    });
  });

  it("rejects category and unit ids outside the current tenant", async () => {
    const fixture = await createProductFixture("ProductsTenantRefs");

    await expect(
      createProduct(fixture.tenantId, {
        sku: "BAD-CAT",
        name: "Bad category",
        categoryId: fixture.otherCategoryId,
        baseUnitId: fixture.baseUnitId,
        buyPrice: 1,
        sellPriceEceran: 1,
        sellPriceGrosir: 1,
        minStock: 0,
      }),
    ).rejects.toMatchObject<AppError>({ status: 400, code: "category_invalid" });

    await expect(
      createProduct(fixture.tenantId, {
        sku: "BAD-UNIT",
        name: "Bad unit",
        baseUnitId: fixture.otherUnitId,
        buyPrice: 1,
        sellPriceEceran: 1,
        sellPriceGrosir: 1,
        minStock: 0,
      }),
    ).rejects.toMatchObject<AppError>({ status: 400, code: "base_unit_invalid" });
  });
});
