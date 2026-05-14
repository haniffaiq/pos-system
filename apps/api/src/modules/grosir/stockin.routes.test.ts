import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "../../middleware/error";
import { stockInRoutes } from "./stockin.routes";
import { createStockIn, listStockIn } from "./stockin.service";

vi.mock("./stockin.service", () => ({
  createStockIn: vi.fn(),
  listStockIn: vi.fn(),
}));

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const productId = "00000000-0000-4000-8000-000000000003";
const unitId = "00000000-0000-4000-8000-000000000004";
const stockInRow = {
  id: "stock-in-1",
  supplier_id: null,
  note: "first delivery",
  total_cost: 15000,
  created_at: "2026-05-15T00:00:00.000Z",
};

function testApp(role: JwtPayload["role"] = "manager") {
  const app = new Hono<{ Variables: { auth: JwtPayload } }>();
  app.onError(onError);
  app.use("*", async (c, next) => {
    c.set("auth", { sub: userId, tenantId, role });
    await next();
  });
  app.route("/stock-in", stockInRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("stock-in routes", () => {
  it("allows tenant roles to list stock-in records", async () => {
    vi.mocked(listStockIn).mockResolvedValueOnce([stockInRow]);

    const response = await testApp("cashier").request("/stock-in");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([stockInRow]);
    expect(listStockIn).toHaveBeenCalledWith(tenantId);
  });

  it("allows managers to create stock-in records", async () => {
    vi.mocked(createStockIn).mockResolvedValueOnce(stockInRow);
    const input = { items: [{ productId, unitId, qty: 1, unitCost: 15000 }] };

    const response = await testApp("manager").request("/stock-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(stockInRow);
    expect(createStockIn).toHaveBeenCalledWith(tenantId, userId, input);
  });

  it("rejects cashier stock-in writes", async () => {
    const response = await testApp("cashier").request("/stock-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ productId, unitId, qty: 1, unitCost: 15000 }] }),
    });

    expect(response.status).toBe(403);
    expect(createStockIn).not.toHaveBeenCalled();
  });
});
