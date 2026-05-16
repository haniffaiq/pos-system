import { createHash } from "node:crypto";

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { billingWebhookRouter, processMidtransWebhook, processXenditWebhook } from "./billing-webhook";

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

function midtransPayload(overrides: Record<string, unknown> = {}, serverKey = "midtrans-server") {
  const payload = {
    order_id: "BILL-1",
    status_code: "200",
    gross_amount: "299000.00",
    transaction_status: "settlement",
    transaction_id: "midtrans-tx-1",
    ...overrides,
  };
  return {
    ...payload,
    signature_key: createHash("sha512")
      .update(`${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`)
      .digest("hex"),
  };
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

  it("does not activate subscriptions when expired Xendit invoices receive later paid callbacks", async () => {
    const q = queryFromResponses([
      [
        {
          id: "invoice-1",
          tenant_id: "tenant-1",
          subscription_id: "subscription-1",
          status: "expired",
        },
      ],
    ]);

    const out = await processXenditWebhook(
      { external_id: "BILL-1", id: "xendit-invoice-1", status: "PAID" },
      { "x-callback-token": "good-token" },
      q as Query,
      { webhookToken: "good-token" },
    );

    expect(out).toEqual({ ok: true, reason: "ignored", status: "paid" });
    expect(q).toHaveBeenCalledTimes(1);
    expect(q.mock.calls.map((call) => call[0]).join("\n")).not.toContain("update subscriptions");
  });

  it("requires provider-scoped order matching for Xendit callbacks", async () => {
    const q = queryFromResponses([[]]);

    const out = await processXenditWebhook(
      { external_id: "BILL-midtrans-order", id: "xendit-invoice-1", status: "PAID" },
      { "x-callback-token": "good-token" },
      q as Query,
      { webhookToken: "good-token" },
    );

    expect(out).toEqual({ ok: true, reason: "unknown_order" });
    expect(q).toHaveBeenCalledWith(expect.stringContaining("psp_provider = 'xendit'"), ["BILL-midtrans-order"]);
    expect(q).toHaveBeenCalledTimes(1);
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

describe("processMidtransWebhook", () => {
  it("rejects bad Midtrans signatures before any database writes", async () => {
    const q = vi.fn();

    const out = await processMidtransWebhook(
      { ...midtransPayload({}, "correct-server-key"), signature_key: "bad-signature" },
      q as Query,
      { serverKey: "correct-server-key" },
    );

    expect(out).toEqual({ ok: false, reason: "signature" });
    expect(q).not.toHaveBeenCalled();
  });

  it("marks pending Midtrans invoices paid and activates subscriptions in the same transaction", async () => {
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

    const out = await processMidtransWebhook(midtransPayload(), q as Query, { serverKey: "midtrans-server" });

    expect(out).toEqual({ ok: true, reason: "updated", status: "paid" });
    expect(q).toHaveBeenNthCalledWith(1, expect.stringContaining("psp_provider = 'midtrans'"), ["BILL-1"]);
    expect(q).toHaveBeenNthCalledWith(2, expect.stringContaining("update invoices"), ["midtrans-tx-1", "BILL-1"]);
    expect(q).toHaveBeenNthCalledWith(3, expect.stringContaining("update subscriptions"), ["subscription-1"]);
  });

  it("does not downgrade an already paid Midtrans invoice on a later failed webhook", async () => {
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

    const out = await processMidtransWebhook(
      midtransPayload({ transaction_status: "expire", transaction_id: "midtrans-tx-2" }),
      q as Query,
      { serverKey: "midtrans-server" },
    );

    expect(out).toEqual({ ok: true, reason: "already_paid", status: "paid" });
    expect(q).toHaveBeenCalledTimes(1);
  });

  it("allows failed Midtrans invoices to become paid on a later verified paid webhook", async () => {
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

    const out = await processMidtransWebhook(midtransPayload({ transaction_status: "settlement" }), q as Query, { serverKey: "midtrans-server" });

    expect(out).toEqual({ ok: true, reason: "updated", status: "paid" });
    expect(q).toHaveBeenCalledTimes(3);
  });

  it("acknowledges unknown verified Midtrans orders without creating invoice rows", async () => {
    const q = queryFromResponses([[]]);

    const out = await processMidtransWebhook(midtransPayload({ order_id: "BILL-missing" }), q as Query, { serverKey: "midtrans-server" });

    expect(out).toEqual({ ok: true, reason: "unknown_order" });
    expect(q).toHaveBeenCalledTimes(1);
  });
});

describe("billingWebhookRouter", () => {
  it("returns non-200 for unverified Midtrans callbacks", async () => {
    vi.stubEnv("MIDTRANS_ENV", "sandbox");
    vi.stubEnv("MIDTRANS_SERVER_KEY", "midtrans-server");
    vi.stubEnv("MIDTRANS_CLIENT_KEY", "midtrans-client");
    vi.stubEnv("MIDTRANS_MERCHANT_ID", "midtrans-merchant");
    withAdminMock.mockImplementationOnce((fn: (q: Query) => Promise<unknown>) => fn(vi.fn() as Query));

    const response = await testApp().request("/api/v1/billing/midtrans/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...midtransPayload(), signature_key: "bad-signature" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 200 for verified unknown Midtrans orders to avoid retry storms", async () => {
    vi.stubEnv("MIDTRANS_ENV", "sandbox");
    vi.stubEnv("MIDTRANS_SERVER_KEY", "midtrans-server");
    vi.stubEnv("MIDTRANS_CLIENT_KEY", "midtrans-client");
    vi.stubEnv("MIDTRANS_MERCHANT_ID", "midtrans-merchant");
    const q = queryFromResponses([[]]);
    withAdminMock.mockImplementationOnce((fn: (q: Query) => Promise<unknown>) => fn(q as Query));

    const response = await testApp().request("/api/v1/billing/midtrans/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(midtransPayload({ order_id: "BILL-missing" })),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.loggerWarn).toHaveBeenCalledWith({ orderId: "BILL-missing", reason: "unknown_order" }, "midtrans webhook");
  });

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
