import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "../../middleware/error";
import { createSale, listSales } from "./sales.service";
import { salesRoutes } from "./sales.routes";

vi.mock("./sales.service", () => ({
  createSale: vi.fn(),
  listSales: vi.fn(),
}));

const tenantId = "00000000-0000-4000-8000-000000000001";
const saleRow = {
  id: "sale-1",
  invoice_no: "INV-20260515-0001",
  customer_name: "Bu Ani",
  total: 146000,
  paid: 200000,
  change: 54000,
  payment_method: "cash",
  created_at: "2026-05-15T04:00:00.000Z",
};

function testApp(role: JwtPayload["role"] = "cashier") {
  const app = new Hono<{ Variables: { auth: JwtPayload } }>();
  app.onError(onError);
  app.use("*", async (c, next) => {
    c.set("auth", { sub: "user-1", tenantId, role });
    await next();
  });
  app.route("/sales", salesRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("sales routes", () => {
  it("allows cashiers to list and create sales", async () => {
    vi.mocked(listSales).mockResolvedValueOnce([saleRow]);
    vi.mocked(createSale).mockResolvedValueOnce(saleRow);
    const input = {
      customerName: "Bu Ani",
      paymentMethod: "cash" as const,
      paid: 200000,
      items: [{ productId: "prod-1", unitType: "grosir" as const, qty: 1 }],
    };
    const app = testApp("cashier");

    const listResponse = await app.request("/sales?from=2026-05-01&to=2026-05-31");
    const createResponse = await app.request("/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual([saleRow]);
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual(saleRow);
    expect(listSales).toHaveBeenCalledWith(tenantId, { from: "2026-05-01", to: "2026-05-31" });
    expect(createSale).toHaveBeenCalledWith(tenantId, "user-1", input);
  });

  it("allows owners and managers to create sales too", async () => {
    vi.mocked(createSale).mockResolvedValue(saleRow);
    for (const role of ["owner", "manager"] as const) {
      const response = await testApp(role).request("/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "cash",
          paid: 12000,
          items: [{ productId: "prod-1", unitType: "eceran", qty: 1 }],
        }),
      });
      expect(response.status).toBe(201);
    }
    expect(createSale).toHaveBeenCalledTimes(2);
  });
});
