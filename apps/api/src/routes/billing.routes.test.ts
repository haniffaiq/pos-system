import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { signAccess } from "../lib/jwt";
import { onError } from "../middleware/error";
import { billingRoutes } from "./billing.routes";
import { createBillingCheckout, getBillingSummary } from "../services/billing.service";

vi.mock("../services/billing.service", () => ({
  getBillingSummary: vi.fn(),
  createBillingCheckout: vi.fn(),
}));

const getBillingSummaryMock = vi.mocked(getBillingSummary);
const createBillingCheckoutMock = vi.mocked(createBillingCheckout);

function testApp() {
  const app = new Hono();
  app.onError(onError);
  app.route("/api/v1/billing", billingRoutes);
  return app;
}

async function tenantToken() {
  return signAccess({ sub: "user-1", tenantId: "11111111-1111-4111-8111-111111111111", role: "owner" });
}

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("billing routes", () => {
  it("returns the authenticated tenant billing summary", async () => {
    const token = await tenantToken();
    getBillingSummaryMock.mockResolvedValueOnce({
      plan: { code: "pro", name: "Pro", priceIdr: 299000, quota: { outlets: 3 } },
      subscription: { status: "active", currentPeriodEnd: "2026-06-16T00:00:00.000Z" },
      invoices: [{ id: "invoice-1", amountIdr: 299000, status: "paid", pspProvider: "xendit", createdAt: "2026-05-16T00:00:00.000Z" }],
    });

    const response = await testApp().request("/api/v1/billing/summary", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      plan: { code: "pro", name: "Pro", priceIdr: 299000, quota: { outlets: 3 } },
      subscription: { status: "active", currentPeriodEnd: "2026-06-16T00:00:00.000Z" },
      invoices: [{ id: "invoice-1", amountIdr: 299000, status: "paid", pspProvider: "xendit", createdAt: "2026-05-16T00:00:00.000Z" }],
    });
    expect(getBillingSummaryMock).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("accepts the HTTP-only access cookie for browser billing requests", async () => {
    const token = await tenantToken();
    getBillingSummaryMock.mockResolvedValueOnce({ plan: null, subscription: null, invoices: [] });

    const response = await testApp().request("/api/v1/billing/summary", {
      headers: { cookie: `owa.access=${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: null, subscription: null, invoices: [] });
    expect(getBillingSummaryMock).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("creates a checkout using the authenticated tenant and provider-neutral response", async () => {
    const token = await tenantToken();
    createBillingCheckoutMock.mockResolvedValueOnce({ redirectUrl: "https://checkout.example/invoice-1", provider: "midtrans" });

    const response = await testApp().request("/api/v1/billing/checkout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ plan: "business" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectUrl: "https://checkout.example/invoice-1", provider: "midtrans" });
    expect(createBillingCheckoutMock).toHaveBeenCalledWith({
      tenantId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      planCode: "business",
    });
  });

  it("rejects platform admins", async () => {
    const token = await signAccess({ sub: "admin-1", tenantId: null, role: "platform_admin" });

    const response = await testApp().request("/api/v1/billing/summary", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(getBillingSummaryMock).not.toHaveBeenCalled();
  });
});
