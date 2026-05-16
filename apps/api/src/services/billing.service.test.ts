import { describe, expect, it, vi } from "vitest";

import type { PaymentProvider, ProviderResolution } from "../lib/payments/provider";

const mocks = vi.hoisted(() => ({
  withAdmin: vi.fn(),
  resolvePaymentProvider: vi.fn(),
}));

vi.mock("../db/withTenant", () => ({
  withAdmin: mocks.withAdmin,
}));

vi.mock("../lib/payments/provider", () => ({
  resolvePaymentProvider: mocks.resolvePaymentProvider,
}));

const withAdminMock = mocks.withAdmin;
const resolvePaymentProviderMock = mocks.resolvePaymentProvider;

import { createBillingCheckout } from "./billing.service";

type Query = Parameters<Parameters<typeof withAdminMock>[0]>[0];

function configuredProvider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    name: "midtrans",
    configured: () => true,
    missingConfig: () => [],
    createCheckout: vi.fn(async ({ orderId }) => ({
      provider: "midtrans",
      orderId,
      redirectUrl: "https://snap.midtrans.test/pay",
      token: "snap-token",
    })),
    getStatus: vi.fn(),
    verifyWebhook: vi.fn(),
    parseWebhook: vi.fn(),
    ...overrides,
  };
}

function resolution(provider = configuredProvider()): ProviderResolution {
  return { activePsp: "midtrans", effectivePsp: provider.name, provider, missingConfig: [] };
}

function queryFromResponses(responses: unknown[][]) {
  return vi.fn(async () => ({ rows: responses.shift() ?? [], rowCount: 1 }));
}

describe("createBillingCheckout", () => {
  it("uses the resolved provider to insert a provider-neutral pending invoice before checkout", async () => {
    const provider = configuredProvider();
    resolvePaymentProviderMock.mockReturnValueOnce(resolution(provider));
    const q = queryFromResponses([[{ id: "plan-pro", code: "pro", name: "Pro", price_idr: "299000", quota: {} }], [{ id: "sub-1" }], []]);
    withAdminMock.mockImplementationOnce((fn: (q: Query) => Promise<unknown>) => fn(q as Query));

    const out = await createBillingCheckout({ tenantId: "11111111-1111-4111-8111-111111111111", userId: "user-1", planCode: "pro" });

    expect(resolvePaymentProviderMock.mock.invocationCallOrder[0]).toBeLessThan(q.mock.invocationCallOrder[0]);
    expect(q).toHaveBeenNthCalledWith(3, expect.stringContaining("insert into invoices"), [
      "11111111-1111-4111-8111-111111111111",
      "sub-1",
      299000,
      "midtrans",
      expect.stringMatching(/^BILL-11111111-/),
      expect.any(Date),
    ]);
    expect(q.mock.calls.map((call) => call[0]).join("\n")).not.toContain("insert into subscriptions");
    expect(provider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: expect.stringMatching(/^BILL-11111111-/), amountIdr: 299000, description: "BroSolution Pro plan" }),
      process.env,
    );
    expect(out).toEqual({ provider: "midtrans", orderId: expect.stringMatching(/^BILL-11111111-/), redirectUrl: "https://snap.midtrans.test/pay", token: "snap-token" });
  });

  it("marks the invoice failed and raises BILLING_PROVIDER_UNAVAILABLE when checkout API fails", async () => {
    const provider = configuredProvider({
      createCheckout: vi.fn(async () => {
        throw new Error("PSP unavailable");
      }),
    });
    resolvePaymentProviderMock.mockReturnValueOnce(resolution(provider));
    const q = queryFromResponses([[{ id: "plan-business", code: "business", name: "Business", price_idr: "599000", quota: {} }], [{ id: "sub-1" }], [], []]);
    withAdminMock.mockImplementationOnce((fn: (q: Query) => Promise<unknown>) => fn(q as Query));

    await expect(createBillingCheckout({ tenantId: "11111111-1111-4111-8111-111111111111", userId: "user-1", planCode: "business" })).rejects.toMatchObject({
      status: 503,
      code: "BILLING_PROVIDER_UNAVAILABLE",
    });

    expect(q).toHaveBeenLastCalledWith("update invoices set status = 'failed', updated_at = now() where psp_order_id = $1", [expect.stringMatching(/^BILL-11111111-/)]);
  });
});
