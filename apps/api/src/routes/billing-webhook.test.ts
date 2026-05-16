import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { billingWebhookRouter, processXenditWebhook } from "./billing-webhook";

const mocks = vi.hoisted(() => ({
  withAdmin: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../db/withTenant", () => ({
  withAdmin: mocks.withAdmin,
}));

vi.mock("../lib/logger", () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const withAdminMock = mocks.withAdmin;

type Query = Parameters<Parameters<typeof withAdminMock>[0]>[0];

function testApp() {
  const app = new Hono();
  app.route("/api/v1/billing", billingWebhookRouter);
  return app;
}

function queryFromResponses(responses: unknown[][]) {
  return vi.fn(async () => ({ rows: responses.shift() ?? [], rowCount: 1 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("processXenditWebhook", () => {
  it("rejects bad Xendit callback tokens before any database writes", async () => {
    const q = vi.fn();

    const out = await processXenditWebhook(
      { external_id: "BILL-1", status: "PAID" },
      { "x-callback-token": "bad-token" },
      q as Query,
      { webhookToken: "good-token" },
    );

    expect(out).toEqual({ ok: false, reason: "signature" });
    expect(q).not.toHaveBeenCalled();
  });

  it("marks pending Xendit invoices paid and activates subscriptions in the same transaction", async () => {
    const q = queryFromResponses([
      [
        {
          id: "invoice-1",
          tenant_id: "tenant-1",
          subscription_id: "subscription-1",
          status: "pending",
        },
      ],
      [],
      [],
    ]);

    const out = await processXenditWebhook(
      { external_id: "BILL-1", id: "xendit-invoice-1", status: "PAID", payment_method: "BANK_TRANSFER" },
      { "x-callback-token": "good-token" },
      q as Query,
      { webhookToken: "good-token" },
    );

    expect(out).toEqual({ ok: true, reason: "updated", status: "paid" });
    expect(q).toHaveBeenNthCalledWith(1, expect.stringContaining("psp_provider = 'xendit'"), ["BILL-1"]);
    expect(q).toHaveBeenNthCalledWith(2, expect.stringContaining("update invoices"), ["xendit-invoice-1", "BANK_TRANSFER", "BILL-1"]);
    expect(q).toHaveBeenNthCalledWith(3, expect.stringContaining("update subscriptions"), ["subscription-1"]);
  });

  it("does not downgrade an already paid invoice on later failed or expired webhooks", async () => {
    const q = queryFromResponses([
      [
        {
          id: "invoice-1",
          tenant_id: "tenant-1",
          subscription_id: "subscription-1",
          status: "paid",
        },
      ],
    ]);

    const out = await processXenditWebhook(
      { external_id: "BILL-1", id: "xendit-invoice-1", status: "EXPIRED" },
      { "x-callback-token": "good-token" },
      q as Query,
      { webhookToken: "good-token" },
    );

    expect(out).toEqual({ ok: true, reason: "already_paid", status: "paid" });
    expect(q).toHaveBeenCalledTimes(1);
  });

  it("allows failed invoices to become paid on a later verified paid webhook", async () => {
    const q = queryFromResponses([
      [
        {
          id: "invoice-1",
          tenant_id: "tenant-1",
          subscription_id: "subscription-1",
          status: "failed",
        },
      ],
      [],
      [],
    ]);

    const out = await processXenditWebhook(
      { external_id: "BILL-1", id: "xendit-invoice-1", status: "SETTLED" },
      { "x-callback-token": "good-token" },
      q as Query,
      { webhookToken: "good-token" },
    );

    expect(out).toEqual({ ok: true, reason: "updated", status: "paid" });
    expect(q).toHaveBeenCalledTimes(3);
  });

  it("acknowledges unknown verified orders without creating invoice rows", async () => {
    const q = queryFromResponses([[]]);

    const out = await processXenditWebhook(
      { external_id: "BILL-missing", status: "PAID" },
      { "x-callback-token": "good-token" },
      q as Query,
      { webhookToken: "good-token" },
    );

    expect(out).toEqual({ ok: true, reason: "unknown_order" });
    expect(q).toHaveBeenCalledTimes(1);
  });
});

describe("billingWebhookRouter", () => {
  it("returns non-200 for unverified Xendit callbacks", async () => {
    vi.stubEnv("XENDIT_WEBHOOK_TOKEN", "good-token");
    withAdminMock.mockImplementationOnce((fn: (q: Query) => Promise<unknown>) => fn(vi.fn() as Query));

    const response = await testApp().request("/api/v1/billing/xendit/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-callback-token": "bad-token" },
      body: JSON.stringify({ external_id: "BILL-1", status: "PAID" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 200 for verified unknown Xendit orders to avoid retry storms", async () => {
    vi.stubEnv("XENDIT_WEBHOOK_TOKEN", "good-token");
    const q = queryFromResponses([[]]);
    withAdminMock.mockImplementationOnce((fn: (q: Query) => Promise<unknown>) => fn(q as Query));

    const response = await testApp().request("/api/v1/billing/xendit/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-callback-token": "good-token" },
      body: JSON.stringify({ external_id: "BILL-missing", status: "PAID" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.loggerWarn).toHaveBeenCalledWith({ orderId: "BILL-missing", reason: "unknown_order" }, "xendit webhook");
  });
});
