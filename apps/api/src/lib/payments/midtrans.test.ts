import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMidtransProvider, mapMidtransStatus, midtransProvider, verifyMidtransSignature } from "./midtrans";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

function configureMidtrans() {
  process.env.MIDTRANS_ENV = "sandbox";
  process.env.MIDTRANS_SERVER_KEY = "SB-Mid-server-test";
  process.env.MIDTRANS_CLIENT_KEY = "SB-Mid-client-test";
  process.env.MIDTRANS_MERCHANT_ID = "G123456789";
}

describe("midtrans config", () => {
  it("reports missing config for empty and change_me placeholders", () => {
    process.env.MIDTRANS_ENV = "sandbox";
    process.env.MIDTRANS_SERVER_KEY = "change_me_midtrans_server_key";
    process.env.MIDTRANS_CLIENT_KEY = "";
    process.env.MIDTRANS_MERCHANT_ID = "G123456789";

    const provider = createMidtransProvider();

    expect(provider.configured).toBe(false);
    expect(provider.missingConfig()).toEqual(["MIDTRANS_SERVER_KEY", "MIDTRANS_CLIENT_KEY"]);
  });

  it("is configured when all required values are present", () => {
    configureMidtrans();

    const provider = createMidtransProvider();

    expect(provider.configured).toBe(true);
    expect(provider.missingConfig()).toEqual([]);
  });
});

describe("midtrans signature", () => {
  it("verifies correct SHA512 signature", () => {
    const orderId = "ORD-1";
    const statusCode = "200";
    const grossAmount = "299000.00";
    const serverKey = "SK";
    const signature = createHash("sha512").update(orderId + statusCode + grossAmount + serverKey).digest("hex");

    expect(
      verifyMidtransSignature(
        { order_id: orderId, status_code: statusCode, gross_amount: grossAmount, signature_key: signature },
        serverKey,
      ),
    ).toBe(true);
  });

  it("rejects wrong signature", () => {
    expect(
      verifyMidtransSignature(
        { order_id: "x", status_code: "200", gross_amount: "1.00", signature_key: "bad" },
        "SK",
      ),
    ).toBe(false);
  });
});

describe("midtrans status mapping", () => {
  it.each([
    ["settlement", "paid"],
    ["capture", "paid"],
    ["pending", "pending"],
    ["deny", "failed"],
    ["cancel", "failed"],
    ["failure", "failed"],
    ["expire", "expired"],
    ["refund", "refunded"],
    ["partial_refund", "refunded"],
    ["chargeback", "refunded"],
    ["partial_chargeback", "refunded"],
    ["authorize", "unknown"],
  ] as const)("maps %s to %s", (midtransStatus, expected) => {
    expect(mapMidtransStatus(midtransStatus)).toBe(expected);
  });
});

describe("midtrans provider", () => {
  it("creates Snap checkout and returns provider-neutral shape", async () => {
    configureMidtrans();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "snap-token", redirect_url: "https://snap.example/pay" }), { status: 201 }),
    );
    const provider = createMidtransProvider({ fetch: fetchMock });

    const checkout = await provider.createCheckout({
      orderId: "INV-1",
      amountIdr: 150000,
      customerEmail: "owner@example.com",
      customerName: "Owner",
    });

    expect(checkout).toEqual({
      provider: "midtrans",
      orderId: "INV-1",
      redirectUrl: "https://snap.example/pay",
      token: "snap-token",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.sandbox.midtrans.com/snap/v1/transactions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("gets transaction status and parses it to provider-neutral shape", async () => {
    configureMidtrans();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ order_id: "INV-1", transaction_id: "TX-1", transaction_status: "settlement" }),
        { status: 200 },
      ),
    );
    const provider = createMidtransProvider({ fetch: fetchMock });

    const status = await provider.getStatus("INV-1");

    expect(status).toEqual({
      provider: "midtrans",
      orderId: "INV-1",
      transactionId: "TX-1",
      status: "paid",
      raw: { order_id: "INV-1", transaction_id: "TX-1", transaction_status: "settlement" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sandbox.midtrans.com/v2/INV-1/status",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("verifies and parses signed webhook payloads", () => {
    configureMidtrans();
    const signature = createHash("sha512").update("INV-1" + "200" + "150000.00" + process.env.MIDTRANS_SERVER_KEY).digest("hex");
    const provider = createMidtransProvider();

    const payload = {
      order_id: "INV-1",
      transaction_id: "TX-1",
      transaction_status: "settlement",
      status_code: "200",
      gross_amount: "150000.00",
      signature_key: signature,
    };

    expect(provider.verifyWebhook(payload)).toBe(true);
    expect(provider.parseWebhook(payload)).toEqual({
      provider: "midtrans",
      orderId: "INV-1",
      transactionId: "TX-1",
      status: "paid",
      raw: payload,
    });
  });

  it("exposes a PaymentProvider-compatible wrapper", () => {
    configureMidtrans();
    const signature = createHash("sha512").update("INV-1" + "200" + "150000.00" + process.env.MIDTRANS_SERVER_KEY).digest("hex");

    expect(midtransProvider.provider).toBe("midtrans");
    expect(midtransProvider.configured(process.env)).toBe(true);
    expect(midtransProvider.missingConfig({ ...process.env, MIDTRANS_SERVER_KEY: "change_me" })).toEqual(["MIDTRANS_SERVER_KEY"]);
    expect(
      midtransProvider.verifyWebhook(
        { order_id: "INV-1", status_code: "200", gross_amount: "150000.00", signature_key: signature },
        process.env,
      ),
    ).toBe(true);
  });
});
