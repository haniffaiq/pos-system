import { createHash, timingSafeEqual } from "node:crypto";

export const MIDTRANS_PROVIDER = "midtrans" as const;

export type PaymentStatus = "paid" | "pending" | "failed" | "expired" | "refunded" | "unknown";

export type MidtransEnv = "sandbox" | "production";

export type MidtransConfig = {
  env: MidtransEnv;
  serverKey: string;
  clientKey: string;
  merchantId: string;
};

export type MidtransCheckoutParams = {
  orderId: string;
  amountIdr: number;
  customerEmail: string;
  customerName?: string;
};

export type PaymentCheckout = {
  provider: typeof MIDTRANS_PROVIDER;
  orderId: string;
  redirectUrl: string;
  token?: string;
};

export type PaymentStatusResult = {
  provider: typeof MIDTRANS_PROVIDER;
  orderId: string;
  status: PaymentStatus;
  transactionId?: string;
  raw: MidtransStatusPayload;
};

export type MidtransSignaturePayload = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
};

export type MidtransStatusPayload = Partial<MidtransSignaturePayload> & {
  order_id?: string;
  transaction_id?: string;
  transaction_status?: string;
  fraud_status?: string;
  [key: string]: unknown;
};

export type MidtransProvider = {
  provider: typeof MIDTRANS_PROVIDER;
  configured: boolean;
  missingConfig: () => string[];
  createCheckout: (params: MidtransCheckoutParams) => Promise<PaymentCheckout>;
  getStatus: (orderId: string) => Promise<PaymentStatusResult>;
  verifyWebhook: (payload: MidtransSignaturePayload) => boolean;
  parseWebhook: (payload: MidtransStatusPayload) => PaymentStatusResult;
};

type FetchLike = typeof fetch;

type MidtransProviderOptions = {
  fetch?: FetchLike;
  env?: NodeJS.ProcessEnv;
};

const REQUIRED_CONFIG = ["MIDTRANS_ENV", "MIDTRANS_SERVER_KEY", "MIDTRANS_CLIENT_KEY", "MIDTRANS_MERCHANT_ID"] as const;

export function createMidtransProvider(options: MidtransProviderOptions = {}): MidtransProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  const missingConfig = () => missingMidtransConfig(env);

  return {
    provider: MIDTRANS_PROVIDER,
    get configured() {
      return missingConfig().length === 0;
    },
    missingConfig,
    createCheckout: (params) => createCheckout(params, env, fetchImpl),
    getStatus: (orderId) => getStatus(orderId, env, fetchImpl),
    verifyWebhook: (payload) => verifyMidtransSignature(payload, readConfig(env).serverKey),
    parseWebhook: (payload) => parseMidtransStatus(payload),
  };
}

export const midtransProvider = {
  provider: MIDTRANS_PROVIDER,
  configured(env: NodeJS.ProcessEnv = process.env): boolean {
    return isMidtransConfigured(env);
  },
  missingConfig(env: NodeJS.ProcessEnv = process.env): string[] {
    return missingMidtransConfig(env);
  },
  createCheckout(params: MidtransCheckoutParams, env: NodeJS.ProcessEnv = process.env): Promise<PaymentCheckout> {
    return createMidtransProvider({ env }).createCheckout(params);
  },
  getStatus(orderId: string, env: NodeJS.ProcessEnv = process.env): Promise<PaymentStatusResult> {
    return createMidtransProvider({ env }).getStatus(orderId);
  },
  verifyWebhook(payload: MidtransSignaturePayload, env: NodeJS.ProcessEnv = process.env): boolean {
    if (!isMidtransConfigured(env)) {
      return false;
    }
    return verifyMidtransSignature(payload, readConfig(env).serverKey);
  },
  parseWebhook(payload: MidtransStatusPayload): PaymentStatusResult {
    return parseMidtransStatus(payload);
  },
};

export function missingMidtransConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  return REQUIRED_CONFIG.filter((key) => isMissingConfigValue(env[key]));
}

export function isMidtransConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return missingMidtransConfig(env).length === 0;
}

export function verifyMidtransSignature(payload: MidtransSignaturePayload, serverKey: string): boolean {
  const expected = createHash("sha512")
    .update(payload.order_id + payload.status_code + payload.gross_amount + serverKey)
    .digest("hex");

  return safeEqualHex(expected, payload.signature_key);
}

export function mapMidtransStatus(transactionStatus: string | undefined): PaymentStatus {
  switch (transactionStatus) {
    case "settlement":
    case "capture":
      return "paid";
    case "pending":
      return "pending";
    case "deny":
    case "cancel":
    case "failure":
      return "failed";
    case "expire":
      return "expired";
    case "refund":
    case "partial_refund":
    case "chargeback":
    case "partial_chargeback":
      return "refunded";
    default:
      return "unknown";
  }
}

async function createCheckout(
  params: MidtransCheckoutParams,
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<PaymentCheckout> {
  const config = readConfig(env);
  const response = await fetchImpl(snapUrl(config.env), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authHeader(config.serverKey),
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: params.orderId,
        gross_amount: params.amountIdr,
      },
      customer_details: {
        email: params.customerEmail,
        first_name: params.customerName,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Midtrans Snap request failed with status ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { token?: string; redirect_url?: string };
  if (!data.redirect_url) {
    throw new Error("Midtrans Snap response is missing redirect_url");
  }

  return {
    provider: MIDTRANS_PROVIDER,
    orderId: params.orderId,
    redirectUrl: data.redirect_url,
    token: data.token,
  };
}

async function getStatus(orderId: string, env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<PaymentStatusResult> {
  const config = readConfig(env);
  const response = await fetchImpl(`${apiBaseUrl(config.env)}/v2/${encodeURIComponent(orderId)}/status`, {
    method: "GET",
    headers: {
      authorization: authHeader(config.serverKey),
    },
  });

  if (!response.ok) {
    throw new Error(`Midtrans status request failed with status ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as MidtransStatusPayload;
  return parseMidtransStatus(payload, orderId);
}

function parseMidtransStatus(payload: MidtransStatusPayload, fallbackOrderId?: string): PaymentStatusResult {
  const orderId = typeof payload.order_id === "string" && payload.order_id.length > 0 ? payload.order_id : fallbackOrderId;
  if (!orderId) {
    throw new Error("Midtrans payload is missing order_id");
  }

  const transactionId = typeof payload.transaction_id === "string" && payload.transaction_id.length > 0
    ? payload.transaction_id
    : undefined;

  return {
    provider: MIDTRANS_PROVIDER,
    orderId,
    transactionId,
    status: mapMidtransStatus(payload.transaction_status),
    raw: payload,
  };
}

function readConfig(env: NodeJS.ProcessEnv): MidtransConfig {
  const missing = missingMidtransConfig(env);
  if (missing.length > 0) {
    throw new Error(`Midtrans configuration is incomplete: ${missing.join(", ")}`);
  }

  return {
    env: env.MIDTRANS_ENV === "production" ? "production" : "sandbox",
    serverKey: env.MIDTRANS_SERVER_KEY as string,
    clientKey: env.MIDTRANS_CLIENT_KEY as string,
    merchantId: env.MIDTRANS_MERCHANT_ID as string,
  };
}

function isMissingConfigValue(value: string | undefined): boolean {
  const trimmed = value?.trim();
  return !trimmed || trimmed.toLowerCase().startsWith("change_me");
}

function apiBaseUrl(env: MidtransEnv): string {
  return env === "production" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
}

function snapUrl(env: MidtransEnv): string {
  return env === "production"
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
}

function authHeader(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

function safeEqualHex(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
