import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "../../middleware/error";
import { reportsRoutes } from "./reports.routes";
import { listExports, requestExport, salesReport, stockReport } from "./reports.service";

const quotaMocks = vi.hoisted(() => ({
  loadPlanForTenant: vi.fn(),
  currentMonthlyUsage: vi.fn(),
  countResource: vi.fn(),
  incrementUsage: vi.fn(),
  isOverQuota: vi.fn(),
}));

vi.mock("./reports.service", () => ({
  salesReport: vi.fn(),
  stockReport: vi.fn(),
  requestExport: vi.fn(),
  listExports: vi.fn(),
  getExportDownload: vi.fn(),
}));

vi.mock("../../services/quota.service", () => quotaMocks);

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const appFor = (role: JwtPayload["role"]) => {
  const app = new Hono<{ Variables: { auth: JwtPayload } }>();
  app.onError(onError);
  app.use("*", async (c, next) => {
    c.set("auth", { sub: userId, tenantId, role });
    await next();
  });
  app.route("/reports", reportsRoutes);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_APP_URL = "https://app.example.test";
  quotaMocks.loadPlanForTenant.mockResolvedValue({ status: "active", quota: { exports: 10 } });
  quotaMocks.currentMonthlyUsage.mockResolvedValue(1);
  quotaMocks.isOverQuota.mockImplementation((limit: number, current: number) => current >= limit && limit >= 0);
});

describe("reports routes", () => {
  it.each(["owner", "manager"] as const)("allows %s report/export access", async (role) => {
    vi.mocked(salesReport).mockResolvedValueOnce({ rows: [], grandTotal: 0 });
    vi.mocked(stockReport).mockResolvedValueOnce([]);
    vi.mocked(listExports).mockResolvedValueOnce([]);
    vi.mocked(requestExport).mockResolvedValueOnce({ id: "e1", type: "sales", status: "pending", file_path: null, created_at: "now" });
    const app = appFor(role);
    expect((await app.request("/reports/sales?from=2000-01-01&to=2999-01-01")).status).toBe(200);
    expect((await app.request("/reports/stock?from=2000-01-01&to=2999-01-01")).status).toBe(200);
    expect((await app.request("/reports/exports")).status).toBe(200);
    expect((await app.request("/reports/exports", { method: "POST", body: JSON.stringify({ type: "sales", params: { from: "2000-01-01", to: "2999-01-01" } }) })).status).toBe(202);
    expect(quotaMocks.currentMonthlyUsage).toHaveBeenCalledWith(tenantId, "export_count");
    expect(quotaMocks.incrementUsage).toHaveBeenCalledWith(tenantId, "export_count");
  });

  it("rejects cashiers", async () => {
    expect((await appFor("cashier").request("/reports/sales?from=2000-01-01&to=2999-01-01")).status).toBe(403);
    expect(salesReport).not.toHaveBeenCalled();
  });

  it("rejects export requests when the export quota is exhausted", async () => {
    quotaMocks.loadPlanForTenant.mockResolvedValueOnce({ status: "active", quota: { exports: 2 } });
    quotaMocks.currentMonthlyUsage.mockResolvedValueOnce(2);

    const response = await appFor("owner").request("/reports/exports", {
      method: "POST",
      body: JSON.stringify({ type: "sales", params: { from: "2000-01-01", to: "2999-01-01" } }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "QUOTA_EXCEEDED",
        message: "Quota exceeded",
        details: {
          metric: "exports",
          limit: 2,
          current: 2,
          upgrade_url: `https://app.example.test/t/${tenantId}/billing`,
        },
      },
    });
    expect(requestExport).not.toHaveBeenCalled();
    expect(quotaMocks.incrementUsage).not.toHaveBeenCalled();
  });
});
