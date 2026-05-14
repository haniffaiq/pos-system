import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "../../middleware/error";
import { adjustmentsRoutes } from "./adjustments.routes";
import { createAdjustment, listAdjustments } from "./adjustments.service";

vi.mock("./adjustments.service", () => ({
  createAdjustment: vi.fn(),
  listAdjustments: vi.fn(),
}));

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const productId = "00000000-0000-4000-8000-000000000003";
const adjustmentRow = {
  id: "adjustment-1",
  product_id: productId,
  qty_base: -3,
  reason: "hilang",
  note: "stok opname",
  created_at: "2026-05-15T00:00:00Z",
};

function testApp(role: JwtPayload["role"] = "manager") {
  const app = new Hono<{ Variables: { auth: JwtPayload } }>();
  app.onError(onError);
  app.use("*", async (c, next) => {
    c.set("auth", { sub: userId, tenantId, role });
    await next();
  });
  app.route("/adjustments", adjustmentsRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("adjustments routes", () => {
  it("allows managers to list and create stock adjustments", async () => {
    vi.mocked(listAdjustments).mockResolvedValueOnce([adjustmentRow]);
    vi.mocked(createAdjustment).mockResolvedValueOnce(adjustmentRow);
    const input = { productId, qtyBase: -3, reason: "hilang" as const, note: "stok opname" };
    const app = testApp("manager");

    const listResponse = await app.request("/adjustments");
    const createResponse = await app.request("/adjustments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual([adjustmentRow]);
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual(adjustmentRow);
    expect(listAdjustments).toHaveBeenCalledWith(tenantId);
    expect(createAdjustment).toHaveBeenCalledWith(tenantId, userId, input);
  });

  it("rejects cashiers and invalid adjustment reasons before writing", async () => {
    const cashierResponse = await testApp("cashier").request("/adjustments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, qtyBase: -1, reason: "rusak" }),
    });
    const invalidResponse = await testApp("owner").request("/adjustments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, qtyBase: -1, reason: "expired" }),
    });

    expect(cashierResponse.status).toBe(403);
    expect(invalidResponse.status).toBe(400);
    expect(createAdjustment).not.toHaveBeenCalled();
  });
});
