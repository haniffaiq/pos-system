import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "../../middleware/error";
import { reportsRoutes } from "./reports.routes";
import { listExports, requestExport, salesReport, stockReport } from "./reports.service";

vi.mock("./reports.service", () => ({
  salesReport: vi.fn(),
  stockReport: vi.fn(),
  requestExport: vi.fn(),
  listExports: vi.fn(),
  getExportDownload: vi.fn(),
}));

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

beforeEach(() => vi.clearAllMocks());

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
  });

  it("rejects cashiers", async () => {
    expect((await appFor("cashier").request("/reports/sales?from=2000-01-01&to=2999-01-01")).status).toBe(403);
    expect(salesReport).not.toHaveBeenCalled();
  });
});
