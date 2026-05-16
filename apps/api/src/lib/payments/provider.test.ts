import { describe, expect, it, vi } from "vitest";

import { AppError } from "../errors";
import {
  getPaymentProviderConfig,
  resolvePaymentProvider,
  type PaymentProvider,
  type PspProvider,
} from "./provider";

const midtransEnv = {
  MIDTRANS_ENV: "sandbox",
  MIDTRANS_SERVER_KEY: "midtrans-server",
  MIDTRANS_CLIENT_KEY: "midtrans-client",
  MIDTRANS_MERCHANT_ID: "midtrans-merchant",
};

const xenditEnv = {
  XENDIT_ENV: "sandbox",
  XENDIT_SECRET_KEY: "xendit-secret",
  XENDIT_PUBLIC_KEY: "xendit-public",
  XENDIT_WEBHOOK_TOKEN: "xendit-webhook",
};

function provider(name: PspProvider, missingConfig: string[] = []): PaymentProvider {
  return {
    name,
    configured: () => missingConfig.length === 0,
    missingConfig: () => missingConfig,
    createCheckout: vi.fn(),
    getStatus: vi.fn(),
    verifyWebhook: vi.fn(),
    parseWebhook: vi.fn(),
  };
}

describe("payment provider resolver", () => {
  it("uses Midtrans by default when BILLING_ACTIVE_PSP is unset", () => {
    const result = resolvePaymentProvider({ env: { ...midtransEnv }, providers: [provider("midtrans"), provider("xendit", ["XENDIT_SECRET_KEY"])] });

    expect(result.activePsp).toBe("midtrans");
    expect(result.effectivePsp).toBe("midtrans");
    expect(result.provider.name).toBe("midtrans");
    expect(result.fallbackPsp).toBeUndefined();
  });

  it("falls back to the other configured PSP when the selected PSP config is incomplete", () => {
    const warn = vi.fn();
    const result = resolvePaymentProvider({
      env: { BILLING_ACTIVE_PSP: "midtrans", ...xenditEnv },
      providers: [provider("midtrans", ["MIDTRANS_SERVER_KEY", "MIDTRANS_CLIENT_KEY"]), provider("xendit")],
      logger: { warn },
    });

    expect(result.activePsp).toBe("midtrans");
    expect(result.effectivePsp).toBe("xendit");
    expect(result.provider.name).toBe("xendit");
    expect(result.fallbackPsp).toBe("xendit");
    expect(result.missingConfig).toEqual(["MIDTRANS_SERVER_KEY", "MIDTRANS_CLIENT_KEY"]);
    expect(warn).toHaveBeenCalledWith({
      event: "billing_psp_fallback",
      activePsp: "midtrans",
      fallbackPsp: "xendit",
      missingConfig: ["MIDTRANS_SERVER_KEY", "MIDTRANS_CLIENT_KEY"],
    });
  });

  it("does not fall back when the active PSP is configured", () => {
    const active = provider("midtrans");
    active.createCheckout = vi.fn().mockRejectedValue(new Error("Midtrans API 500"));

    const result = resolvePaymentProvider({
      env: { BILLING_ACTIVE_PSP: "midtrans", ...midtransEnv, ...xenditEnv },
      providers: [active, provider("xendit")],
    });

    expect(result.provider).toBe(active);
    expect(result.fallbackPsp).toBeUndefined();
  });

  it("throws BILLING_CONFIG_INVALID for an invalid active PSP", () => {
    expect(() =>
      resolvePaymentProvider({
        env: { BILLING_ACTIVE_PSP: "stripe", ...midtransEnv },
        providers: [provider("midtrans"), provider("xendit", ["XENDIT_SECRET_KEY"])],
      }),
    ).toThrowError(AppError);

    try {
      resolvePaymentProvider({ env: { BILLING_ACTIVE_PSP: "stripe" }, providers: [provider("midtrans"), provider("xendit")] });
    } catch (error) {
      expect(error).toMatchObject({ code: "BILLING_CONFIG_INVALID" });
    }
  });

  it("throws BILLING_PSP_NOT_CONFIGURED with missing env names when neither PSP is configured", () => {
    try {
      resolvePaymentProvider({
        env: { BILLING_ACTIVE_PSP: "xendit" },
        providers: [provider("midtrans", ["MIDTRANS_SERVER_KEY"]), provider("xendit", ["XENDIT_SECRET_KEY"])],
      });
      throw new Error("expected resolver to throw");
    } catch (error) {
      expect(error).toMatchObject({
        code: "BILLING_PSP_NOT_CONFIGURED",
        details: {
          missingConfig: {
            midtrans: ["MIDTRANS_SERVER_KEY"],
            xendit: ["XENDIT_SECRET_KEY"],
          },
        },
      });
    }
  });
});

describe("admin payment provider config", () => {
  it("exposes active/effective PSP and missing env names without secret values", () => {
    const config = getPaymentProviderConfig({
      BILLING_ACTIVE_PSP: "midtrans",
      MIDTRANS_SERVER_KEY: "change_me_midtrans_server_key",
      MIDTRANS_CLIENT_KEY: "midtrans-client",
      MIDTRANS_MERCHANT_ID: "midtrans-merchant",
      ...xenditEnv,
    });

    expect(config).toEqual({
      activePsp: "midtrans",
      effectivePsp: "xendit",
      fallbackPsp: "xendit",
      providers: [
        { name: "midtrans", configured: false, missingConfig: ["MIDTRANS_ENV", "MIDTRANS_SERVER_KEY"] },
        { name: "xendit", configured: true, missingConfig: [] },
      ],
    });
    expect(JSON.stringify(config)).not.toContain("xendit-secret");
    expect(JSON.stringify(config)).not.toContain("midtrans-client");
  });

  it("returns a clear BILLING_PSP_NOT_CONFIGURED error when neither PSP is configured", () => {
    const config = getPaymentProviderConfig({ BILLING_ACTIVE_PSP: "xendit" });

    expect(config.effectivePsp).toBeNull();
    expect(config.error).toMatchObject({
      code: "BILLING_PSP_NOT_CONFIGURED",
      details: {
        missingConfig: {
          midtrans: ["MIDTRANS_ENV", "MIDTRANS_SERVER_KEY", "MIDTRANS_CLIENT_KEY", "MIDTRANS_MERCHANT_ID"],
          xendit: ["XENDIT_ENV", "XENDIT_SECRET_KEY", "XENDIT_PUBLIC_KEY", "XENDIT_WEBHOOK_TOKEN"],
        },
      },
    });
  });
});
