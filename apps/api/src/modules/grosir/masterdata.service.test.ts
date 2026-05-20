import { afterAll, describe, expect, it } from "vitest";

import { adminPool, tenantPool } from "../../db/pool";
import { withAdmin } from "../../db/withTenant";
import type { AppError } from "../../lib/errors";
import {
  createCategory,
  createSupplier,
  createUnit,
  deleteCategory,
  deleteSupplier,
  deleteUnit,
  listCategories,
  listSuppliers,
  listUnits,
  updateCategory,
  updateSupplier,
  updateUnit,
} from "./masterdata.service";

const databaseUrl = process.env.DATABASE_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

async function createTenantFixture(label: string): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8);
  return withAdmin(async (q) => {
    const tenant = await q<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      [`${label} ${suffix}`, `${label.toLowerCase()}-${suffix}`],
    );
    return tenant.rows[0]!.id;
  });
}

describeWithDatabase("masterdata service", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("creates, lists, updates, and deletes a category inside one tenant", async () => {
    const tenantId = await createTenantFixture("MDCategory");
    const otherTenantId = await createTenantFixture("MDCategoryOther");

    await createCategory(otherTenantId, { name: "Beras" });
    const created = await createCategory(tenantId, { name: "Beras" });
    expect(created.name).toBe("Beras");

    expect(await listCategories(tenantId)).toContainEqual({ id: created.id, name: "Beras" });
    expect(await listCategories(otherTenantId)).not.toContainEqual({ id: created.id, name: "Beras" });

    await expect(updateCategory(tenantId, created.id, { name: "Beras Premium" })).resolves.toEqual({
      id: created.id,
      name: "Beras Premium",
    });

    await deleteCategory(tenantId, created.id);
    expect(await listCategories(tenantId)).not.toContainEqual({ id: created.id, name: "Beras Premium" });
  });

  it("creates, lists, updates, and deletes a unit inside one tenant", async () => {
    const tenantId = await createTenantFixture("MDUnit");

    const created = await createUnit(tenantId, { name: "sak" });
    expect(await listUnits(tenantId)).toContainEqual({ id: created.id, name: "sak" });

    await expect(updateUnit(tenantId, created.id, { name: "karton" })).resolves.toEqual({
      id: created.id,
      name: "karton",
    });

    await deleteUnit(tenantId, created.id);
    expect(await listUnits(tenantId)).not.toContainEqual({ id: created.id, name: "karton" });
  });

  it("creates, lists, updates, and deletes a supplier inside one tenant", async () => {
    const tenantId = await createTenantFixture("MDSupplier");

    const created = await createSupplier(tenantId, {
      name: "PT Sumber",
      phone: "0812",
      address: "Jl. Mawar",
    });
    expect(await listSuppliers(tenantId)).toContainEqual(created);

    await expect(
      updateSupplier(tenantId, created.id, { name: "PT Sumber Baru", phone: "0813" }),
    ).resolves.toEqual({ id: created.id, name: "PT Sumber Baru", phone: "0813", address: null });

    await deleteSupplier(tenantId, created.id);
    expect(await listSuppliers(tenantId)).not.toContainEqual({
      id: created.id,
      name: "PT Sumber Baru",
      phone: "0813",
      address: null,
    });
  });

  it("rejects updates and deletes for rows outside the current tenant", async () => {
    const tenantId = await createTenantFixture("MDTenantA");
    const otherTenantId = await createTenantFixture("MDTenantB");
    const otherCategory = await createCategory(otherTenantId, { name: "Not Yours" });

    await expect(updateCategory(tenantId, otherCategory.id, { name: "Stolen" })).rejects.toMatchObject<AppError>({
      status: 404,
      code: "category_not_found",
    });
    await expect(deleteCategory(tenantId, otherCategory.id)).rejects.toMatchObject<AppError>({
      status: 404,
      code: "category_not_found",
    });
  });
});
