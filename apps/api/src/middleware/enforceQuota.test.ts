import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "./error";

const loadPlanForTenant = vi.fn();
const currentMonthlyUsage = vi.fn();
const countResource = vi.fn();
const isOverQuota = vi.fn();

vi.mock("../services/quota.service", () => ({
  loadPlanForTenant,
  currentMonthlyUsage,
  countResource,
  isOverQuota,
}));

const { enforceQuota } = await import("./enforceQuota");

const tenantId = "00000000-0000-4000-8000-000000000001";
const auth: JwtPayload = { sub: "user-1", tenantId, role: "manager" };

function testApp(metric: Parameters<typeof enforceQuota>[0]) {
  const app = new Hono<{ Variables: { auth: JwtPayload } }>();
  app.onError(onError);
  app.use("*", async (c, next) => {
    c.set("auth", auth);
    await next();
  });
  app.post("/resource", enforceQuota(metric), (c) => c.json({ ok: true }, 201));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_APP_URL = "https://app.example.test";
  loadPlanForTenant.mockResolvedValue({ status: "active", quota: { skus: 2, tx_per_month: 5 } });
  countResource.mockResolvedValue(1);
  currentMonthlyUsage.mockResolvedValue(0);
  isOverQuota.mockImplementation((limit: number, current: number) => current >= limit && limit >= 0);
});

describe("enforceQuota", () => {
  it("allows requests when current usage is below the plan limit", async () => {
    const response = await testApp("skus").request("/resource", { method: "POST" });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(loadPlanForTenant).toHaveBeenCalledWith(tenantId);
    expect(countResource).toHaveBeenCalledWith(tenantId, "products");
    expect(isOverQuota).toHaveBeenCalledWith(2, 1);
  });

  it("returns the quota exceeded error shape without running the handler", async () => {
    countResource.mockResolvedValueOnce(2);

    const response = await testApp("skus").request("/resource", { method: "POST" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "QUOTA_EXCEEDED",
        message: "Quota exceeded",
        details: {
          metric: "skus",
          limit: 2,
          current: 2,
          upgrade_url: "https://app.example.test/t/00000000-0000-4000-8000-000000000001/billing",
        },
      },
    });
  });

  it("uses monthly usage counters for transaction and export metrics", async () => {
    currentMonthlyUsage.mockResolvedValueOnce(3);

    const response = await testApp("tx_per_month").request("/resource", { method: "POST" });

    expect(response.status).toBe(201);
    expect(currentMonthlyUsage).toHaveBeenCalledWith(tenantId, "tx_count");
    expect(countResource).not.toHaveBeenCalled();
    expect(isOverQuota).toHaveBeenCalledWith(5, 3);
  });

  it("returns subscription inactive when no active tenant plan is available", async () => {
    loadPlanForTenant.mockResolvedValueOnce(null);

    const response = await testApp("skus").request("/resource", { method: "POST" });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: { code: "SUBSCRIPTION_INACTIVE", message: "Subscription is inactive" },
    });
  });
});
