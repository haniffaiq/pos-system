import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "../../middleware/error";
import { getDashboard } from "./dashboard.service";
import { dashboardRoutes } from "./dashboard.routes";

vi.mock("./dashboard.service", () => ({
  getDashboard: vi.fn(),
}));

const tenantId = "00000000-0000-4000-8000-000000000001";
const dashboardPayload = {
  todaySalesTotal: 48000,
  todayTxnCount: 1,
  lowStockCount: 2,
  topProducts: [{ product_id: "prod-1", name: "Teh", qty_sold: 4 }],
};

function testApp(role: JwtPayload["role"] = "cashier") {
  const app = new Hono<{ Variables: { auth: JwtPayload } }>();
  app.onError(onError);
  app.use("*", async (c, next) => {
    c.set("auth", { sub: "user-1", tenantId, role });
    await next();
  });
  app.route("/dashboard", dashboardRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("dashboard routes", () => {
  it("allows cashiers to read the shared dashboard payload for sales-only UI rendering", async () => {
    vi.mocked(getDashboard).mockResolvedValueOnce(dashboardPayload);

    const response = await testApp("cashier").request("/dashboard");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(dashboardPayload);
    expect(getDashboard).toHaveBeenCalledWith(tenantId);
  });

  it("allows owners and managers to read the dashboard", async () => {
    vi.mocked(getDashboard).mockResolvedValue(dashboardPayload);

    for (const role of ["owner", "manager"] as const) {
      const response = await testApp(role).request("/dashboard");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(dashboardPayload);
    }
    expect(getDashboard).toHaveBeenCalledTimes(2);
  });
});
