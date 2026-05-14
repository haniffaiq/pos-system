import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "../../middleware/error";
import { productsRoutes } from "./products.routes";
import { createProduct, getProduct, listProducts, setProductActive, updateProduct } from "./products.service";

vi.mock("./products.service", () => ({
  createProduct: vi.fn(),
  getProduct: vi.fn(),
  listProducts: vi.fn(),
  setProductActive: vi.fn(),
  updateProduct: vi.fn(),
}));

const tenantId = "00000000-0000-4000-8000-000000000001";
const productId = "00000000-0000-4000-8000-000000000002";
const unitId = "00000000-0000-4000-8000-000000000010";
const productRow = {
  id: "prod-1",
  sku: "BRS-1",
  name: "Beras Premium",
  category_id: null,
  base_unit_id: "unit-1",
  bulk_unit_id: null,
  bulk_conversion: null,
  buy_price: 12000,
  sell_price_eceran: 14000,
  sell_price_grosir: 135000,
  min_stock: 5,
  stock_qty: 0,
  is_active: true,
};

function testApp(role: JwtPayload["role"] = "manager") {
  const app = new Hono<{ Variables: { auth: JwtPayload } }>();
  app.onError(onError);
  app.use("*", async (c, next) => {
    c.set("auth", { sub: "user-1", tenantId, role });
    await next();
  });
  app.route("/products", productsRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("products routes", () => {
  it("allows cashiers to list and fetch products", async () => {
    vi.mocked(listProducts).mockResolvedValueOnce([productRow]);
    vi.mocked(getProduct).mockResolvedValueOnce(productRow);

    const app = testApp("cashier");
    const listResponse = await app.request("/products?search=beras&activeOnly=true");
    const getResponse = await app.request(`/products/${productId}`);

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual([productRow]);
    expect(getResponse.status).toBe(200);
    expect(listProducts).toHaveBeenCalledWith(tenantId, { search: "beras", activeOnly: true });
    expect(getProduct).toHaveBeenCalledWith(tenantId, productId);
  });

  it("allows managers to create, update, and deactivate products", async () => {
    vi.mocked(createProduct).mockResolvedValueOnce(productRow);
    vi.mocked(updateProduct).mockResolvedValueOnce({ ...productRow, sell_price_eceran: 15000 });
    vi.mocked(setProductActive).mockResolvedValueOnce();
    const input = {
      sku: "BRS-1",
      name: "Beras Premium",
      baseUnitId: unitId,
      buyPrice: 12000,
      sellPriceEceran: 14000,
      sellPriceGrosir: 135000,
      minStock: 5,
    };
    const app = testApp("manager");

    const createResponse = await app.request("/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const updateResponse = await app.request(`/products/${productId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, sellPriceEceran: 15000 }),
    });
    const activeResponse = await app.request(`/products/${productId}/active`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });

    expect(createResponse.status).toBe(201);
    expect(updateResponse.status).toBe(200);
    expect(activeResponse.status).toBe(200);
    expect(createProduct).toHaveBeenCalledWith(tenantId, input);
    expect(updateProduct).toHaveBeenCalledWith(tenantId, productId, { ...input, sellPriceEceran: 15000 });
    expect(setProductActive).toHaveBeenCalledWith(tenantId, productId, false);
  });

  it("rejects cashier writes", async () => {
    const response = await testApp("cashier").request("/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect(createProduct).not.toHaveBeenCalled();
  });
});
