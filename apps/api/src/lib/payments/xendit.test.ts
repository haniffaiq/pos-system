import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildXenditClient,
  getXenditConfig,
  mapXenditStatus,
  parseXenditWebhook,
  verifyXenditWebhook,
  xenditProvider,
} from "./xendit";

const completeEnv = {
  XENDIT_ENV: "sandbox",
  XENDIT_SECRET_KEY: "xnd_development_secret",
  XENDIT_PUBLIC_KEY: "xnd_public_key",
  XENDIT_WEBHOOK_TOKEN: "webhook-token",
};

describe("Xendit config", () => {
  it("treats empty and change_me placeholder values as missing", () => {
    expect(
      getXenditConfig({
        XENDIT_ENV: "sandbox",
        XENDIT_SECRET_KEY: "change_me_xendit_secret_key",
        XENDIT_PUBLIC_KEY: "",
        XENDIT_WEBHOOK_TOKEN: "change_me",
      }).missingConfig,
    ).toEqual(["XENDIT_SECRET_KEY", "XENDIT_PUBLIC_KEY", "XENDIT_WEBHOOK_TOKEN"]);
  });

  it("reports configured when all required values are present", () => {
    expect(getXenditConfig(completeEnv)).toMatchObject({
      configured: true,
      missingConfig: [],
      env: "sandbox",
    });
  });
});

describe("Xendit checkout/status client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an invoice using orderId as external_id and returns provider-neutral checkout data", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "inv-1",
          external_id: "INV-1",
          invoice_url: "https://checkout.xendit.co/inv-1",
          status: "PENDING",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = buildXenditClient({ env: completeEnv });
    await expect(
      client.createCheckout({
        orderId: "INV-1",
        amountIdr: 299000,
        customerEmail: "owner@example.com",
        description: "BroSolution Pro",
        successRedirectUrl: "https://app.example.com/billing/success",
        failureRedirectUrl: "https://app.example.com/billing/failed",
      }),
    ).resolves.toEqual({
      provider: "xendit",
      orderId: "INV-1",
      redirectUrl: "https://checkout.xendit.co/inv-1",
      providerInvoiceId: "inv-1",
      status: "pending",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.xendit.co/v2/invoices",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: `Basic ${Buffer.from(`${completeEnv.XENDIT_SECRET_KEY}:`).toString("base64")}`,
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          external_id: "INV-1",
          amount: 299000,
          payer_email: "owner@example.com",
          description: "BroSolution Pro",
          success_redirect_url: "https://app.example.com/billing/success",
          failure_redirect_url: "https://app.example.com/billing/failed",
        }),
      }),
    );
  });

  it("gets status by external_id and maps Xendit statuses to billing statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([{ id: "inv-1", external_id: "INV-1", status: "PAID" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(buildXenditClient({ env: completeEnv }).getStatus("INV-1")).resolves.toEqual({
      provider: "xendit",
      orderId: "INV-1",
      providerInvoiceId: "inv-1",
      status: "paid",
      rawStatus: "PAID",
    });
  });
});

describe("Xendit webhook helpers", () => {
  it.each([
    ["PAID", "paid"],
    ["SETTLED", "paid"],
    ["PENDING", "pending"],
    ["EXPIRED", "expired"],
    ["FAILED", "failed"],
    ["REFUNDED", "refunded"],
    ["PARTIALLY_REFUNDED", "refunded"],
    ["SOMETHING_NEW", "unknown"],
  ] as const)("maps %s to %s", (xenditStatus, billingStatus) => {
    expect(mapXenditStatus(xenditStatus)).toBe(billingStatus);
  });

  it("verifies the x-callback-token header without exposing token values", () => {
    expect(verifyXenditWebhook(new Headers({ "x-callback-token": "webhook-token" }), completeEnv.XENDIT_WEBHOOK_TOKEN)).toBe(true);
    expect(verifyXenditWebhook({ "X-Callback-Token": "wrong" }, completeEnv.XENDIT_WEBHOOK_TOKEN)).toBe(false);
  });

  it("parses invoice webhook payloads into a provider-neutral event", () => {
    expect(
      parseXenditWebhook({
        id: "inv-1",
        external_id: "INV-1",
        status: "SETTLED",
        payment_method: "QRIS",
      }),
    ).toEqual({
      provider: "xendit",
      orderId: "INV-1",
      providerInvoiceId: "inv-1",
      status: "paid",
      rawStatus: "SETTLED",
      paymentMethod: "QRIS",
    });
  });

  it("exposes a PaymentProvider-compatible wrapper", () => {
    expect(xenditProvider.provider).toBe("xendit");
    expect(xenditProvider.configured(completeEnv)).toBe(true);
    expect(xenditProvider.missingConfig({ ...completeEnv, XENDIT_SECRET_KEY: "change_me" })).toEqual(["XENDIT_SECRET_KEY"]);
    expect(xenditProvider.verifyWebhook(new Headers({ "x-callback-token": "webhook-token" }), completeEnv)).toBe(true);
  });
});
