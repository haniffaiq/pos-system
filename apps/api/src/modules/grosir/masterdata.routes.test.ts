import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "../../middleware/error";
import { masterdataRoutes } from "./masterdata.routes";
import {
  createCategory,
  createSupplier,
  createUnit,
  deleteCategory,
  listCategories,
  listSuppliers,
  listUnits,
  updateSupplier,
} from "./masterdata.service";

vi.mock("./masterdata.service", () => ({
  createCategory: vi.fn(),
  createSupplier: vi.fn(),
  createUnit: vi.fn(),
  deleteCategory: vi.fn(),
  deleteSupplier: vi.fn(),
  deleteUnit: vi.fn(),
  listCategories: vi.fn(),
  listSuppliers: vi.fn(),
  listUnits: vi.fn(),
  updateCategory: vi.fn(),
  updateSupplier: vi.fn(),
  updateUnit: vi.fn(),
}));

const listCategoriesMock = vi.mocked(listCategories);
const listUnitsMock = vi.mocked(listUnits);
const listSuppliersMock = vi.mocked(listSuppliers);
const createCategoryMock = vi.mocked(createCategory);
const createUnitMock = vi.mocked(createUnit);
const createSupplierMock = vi.mocked(createSupplier);
const updateSupplierMock = vi.mocked(updateSupplier);
const deleteCategoryMock = vi.mocked(deleteCategory);

const tenantId = "00000000-0000-4000-8000-000000000001";

function testApp(role: JwtPayload["role"] = "manager") {
  const app = new Hono<{ Variables: { auth: JwtPayload } }>();
  app.onError(onError);
  app.use("*", async (c, next) => {
    c.set("auth", { sub: "user-1", tenantId, role });
    await next();
  });
  app.route("/masterdata", masterdataRoutes);
  return app;
}

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("masterdata routes", () => {
  it("lists categories, units, and suppliers for any tenant role", async () => {
    listCategoriesMock.mockResolvedValueOnce([{ id: "cat-1", name: "Beras" }]);
    listUnitsMock.mockResolvedValueOnce([{ id: "unit-1", name: "sak" }]);
    listSuppliersMock.mockResolvedValueOnce([{ id: "sup-1", name: "PT Sumber", phone: "0812", address: null }]);

    const app = testApp("cashier");

    await expect(app.request("/masterdata/categories").then((r) => r.json())).resolves.toEqual([
      { id: "cat-1", name: "Beras" },
    ]);
    await expect(app.request("/masterdata/units").then((r) => r.json())).resolves.toEqual([
      { id: "unit-1", name: "sak" },
    ]);
    await expect(app.request("/masterdata/suppliers").then((r) => r.json())).resolves.toEqual([
      { id: "sup-1", name: "PT Sumber", phone: "0812", address: null },
    ]);

    expect(listCategoriesMock).toHaveBeenCalledWith(tenantId);
    expect(listUnitsMock).toHaveBeenCalledWith(tenantId);
    expect(listSuppliersMock).toHaveBeenCalledWith(tenantId);
  });

  it("allows managers to create category, unit, and supplier records", async () => {
    createCategoryMock.mockResolvedValueOnce({ id: "cat-1", name: "Beras" });
    createUnitMock.mockResolvedValueOnce({ id: "unit-1", name: "sak" });
    createSupplierMock.mockResolvedValueOnce({ id: "sup-1", name: "PT Sumber", phone: "0812", address: null });

    const app = testApp("manager");

    const categoryResponse = await app.request("/masterdata/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Beras" }),
    });
    const unitResponse = await app.request("/masterdata/units", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "sak" }),
    });
    const supplierResponse = await app.request("/masterdata/suppliers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "PT Sumber", phone: "0812" }),
    });

    expect(categoryResponse.status).toBe(201);
    expect(unitResponse.status).toBe(201);
    expect(supplierResponse.status).toBe(201);
    expect(createCategoryMock).toHaveBeenCalledWith(tenantId, { name: "Beras" });
    expect(createUnitMock).toHaveBeenCalledWith(tenantId, { name: "sak" });
    expect(createSupplierMock).toHaveBeenCalledWith(tenantId, { name: "PT Sumber", phone: "0812" });
  });

  it("allows owners to update and delete master data", async () => {
    updateSupplierMock.mockResolvedValueOnce({ id: "sup-1", name: "PT Baru", phone: null, address: null });
    deleteCategoryMock.mockResolvedValueOnce();

    const app = testApp("owner");
    const updateResponse = await app.request("/masterdata/suppliers/00000000-0000-4000-8000-000000000002", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "PT Baru" }),
    });
    const deleteResponse = await app.request("/masterdata/categories/00000000-0000-4000-8000-000000000003", {
      method: "DELETE",
    });

    expect(updateResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(updateSupplierMock).toHaveBeenCalledWith(tenantId, "00000000-0000-4000-8000-000000000002", {
      name: "PT Baru",
    });
    expect(deleteCategoryMock).toHaveBeenCalledWith(tenantId, "00000000-0000-4000-8000-000000000003");
  });

  it("rejects cashier writes", async () => {
    const response = await testApp("cashier").request("/masterdata/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Beras" }),
    });

    expect(response.status).toBe(403);
    expect(createCategoryMock).not.toHaveBeenCalled();
  });
});
