export type BillingStatus = "pending" | "paid" | "failed" | "expired" | "refunded" | "unknown";

export type XenditEnv = "sandbox" | "production";

export type XenditConfig = {
  configured: boolean;
  missingConfig: string[];
  env: XenditEnv;
  secretKey?: string;
  publicKey?: string;
  webhookToken?: string;
};

type XenditEnvKey = "XENDIT_ENV" | "XENDIT_SECRET_KEY" | "XENDIT_PUBLIC_KEY" | "XENDIT_WEBHOOK_TOKEN";
type EnvLike = Partial<Record<XenditEnvKey, string | undefined>>;

export type CheckoutInput = {
  orderId: string;
  amountIdr: number;
  customerEmail: string;
  description?: string;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
};

export type CheckoutResult = {
  provider: "xendit";
  orderId: string;
  redirectUrl: string;
  providerInvoiceId?: string;
  status?: BillingStatus;
};

export type ProviderStatus = {
  provider: "xendit";
  orderId: string;
  providerInvoiceId?: string;
  status: BillingStatus;
  rawStatus?: string;
};

export type XenditWebhookEvent = ProviderStatus & {
  paymentMethod?: string;
};

type XenditInvoice = {
  id?: string;
  external_id?: string;
  invoice_url?: string;
  status?: string;
  payment_method?: string;
};

type HeaderLike = Headers | Record<string, string | string[] | undefined>;

const REQUIRED_ENV: Array<keyof EnvLike> = ["XENDIT_SECRET_KEY", "XENDIT_PUBLIC_KEY", "XENDIT_WEBHOOK_TOKEN"];
const INVOICES_URL = "https://api.xendit.co/v2/invoices";

function present(value: string | undefined): value is string {
  const trimmed = value?.trim();
  return Boolean(trimmed && !trimmed.toLowerCase().startsWith("change_me"));
}

function normalizeEnv(value: string | undefined): XenditEnv {
  return value === "production" ? "production" : "sandbox";
}

export function getXenditConfig(env: EnvLike = process.env): XenditConfig {
  const missingConfig = REQUIRED_ENV.filter((key) => !present(env[key]));

  return {
    configured: missingConfig.length === 0,
    missingConfig,
    env: normalizeEnv(env.XENDIT_ENV),
    secretKey: present(env.XENDIT_SECRET_KEY) ? env.XENDIT_SECRET_KEY : undefined,
    publicKey: present(env.XENDIT_PUBLIC_KEY) ? env.XENDIT_PUBLIC_KEY : undefined,
    webhookToken: present(env.XENDIT_WEBHOOK_TOKEN) ? env.XENDIT_WEBHOOK_TOKEN : undefined,
  };
}

function requireXenditConfig(env: EnvLike): Required<Pick<XenditConfig, "secretKey" | "publicKey" | "webhookToken">> & XenditConfig {
  const config = getXenditConfig(env);
  if (!config.configured || !config.secretKey || !config.publicKey || !config.webhookToken) {
    throw new Error(`Xendit is not configured; missing ${config.missingConfig.join(", ")}`);
  }
  return { ...config, secretKey: config.secretKey, publicKey: config.publicKey, webhookToken: config.webhookToken };
}

function authHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

function jsonHeaders(secretKey: string): Record<string, string> {
  return {
    authorization: authHeader(secretKey),
    "content-type": "application/json",
  };
}

async function parseJsonResponse<T>(res: Response, context: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`Xendit ${context} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

function optionalRedirects(input: CheckoutInput): Partial<{
  success_redirect_url: string;
  failure_redirect_url: string;
}> {
  return {
    ...(input.successRedirectUrl ? { success_redirect_url: input.successRedirectUrl } : {}),
    ...(input.failureRedirectUrl ? { failure_redirect_url: input.failureRedirectUrl } : {}),
  };
}

export function mapXenditStatus(status: string | undefined): BillingStatus {
  switch (status?.toUpperCase()) {
    case "PAID":
    case "SETTLED":
      return "paid";
    case "PENDING":
      return "pending";
    case "EXPIRED":
      return "expired";
    case "FAILED":
      return "failed";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "refunded";
    default:
      return "unknown";
  }
}

function invoiceToCheckout(invoice: XenditInvoice, orderId: string): CheckoutResult {
  if (!invoice.invoice_url) {
    throw new Error("Xendit invoice response did not include invoice_url");
  }
  return {
    provider: "xendit",
    orderId,
    redirectUrl: invoice.invoice_url,
    providerInvoiceId: invoice.id,
    status: mapXenditStatus(invoice.status),
  };
}

function invoiceToStatus(invoice: XenditInvoice | undefined, orderId: string): ProviderStatus {
  return {
    provider: "xendit",
    orderId,
    providerInvoiceId: invoice?.id,
    status: mapXenditStatus(invoice?.status),
    rawStatus: invoice?.status,
  };
}

export function parseXenditWebhook(payload: XenditInvoice): XenditWebhookEvent {
  return {
    ...invoiceToStatus(payload, payload.external_id ?? ""),
    paymentMethod: payload.payment_method,
  };
}

function getHeader(headers: HeaderLike, name: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  const desired = name.toLowerCase();
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === desired)?.[1];
  return Array.isArray(found) ? found[0] : found;
}

export function verifyXenditWebhook(headers: HeaderLike, webhookToken: string | undefined): boolean {
  if (!present(webhookToken)) {
    return false;
  }
  return getHeader(headers, "x-callback-token") === webhookToken;
}

export function buildXenditClient(options: { env?: EnvLike } = {}) {
  const env = options.env ?? process.env;

  return {
    async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
      const config = requireXenditConfig(env);
      const invoice = await parseJsonResponse<XenditInvoice>(
        await fetch(INVOICES_URL, {
          method: "POST",
          headers: jsonHeaders(config.secretKey),
          body: JSON.stringify({
            external_id: input.orderId,
            amount: input.amountIdr,
            payer_email: input.customerEmail,
            description: input.description ?? `Invoice ${input.orderId}`,
            ...optionalRedirects(input),
          }),
        }),
        "invoice create",
      );

      return invoiceToCheckout(invoice, input.orderId);
    },

    async getStatus(orderId: string): Promise<ProviderStatus> {
      const config = requireXenditConfig(env);
      const invoices = await parseJsonResponse<XenditInvoice[]>(
        await fetch(`${INVOICES_URL}?external_id=${encodeURIComponent(orderId)}`, {
          headers: { authorization: authHeader(config.secretKey) },
        }),
        "invoice status",
      );

      return invoiceToStatus(invoices[0], orderId);
    },
  };
}

export const xenditProvider = {
  provider: "xendit" as const,
  configured(env: EnvLike = process.env): boolean {
    return getXenditConfig(env).configured;
  },
  missingConfig(env: EnvLike = process.env): string[] {
    return getXenditConfig(env).missingConfig;
  },
  createCheckout(input: CheckoutInput, env: EnvLike = process.env): Promise<CheckoutResult> {
    return buildXenditClient({ env }).createCheckout(input);
  },
  getStatus(orderId: string, env: EnvLike = process.env): Promise<ProviderStatus> {
    return buildXenditClient({ env }).getStatus(orderId);
  },
  verifyWebhook(headers: HeaderLike, env: EnvLike = process.env): boolean {
    return verifyXenditWebhook(headers, getXenditConfig(env).webhookToken);
  },
  parseWebhook(payload: XenditInvoice): XenditWebhookEvent {
    return parseXenditWebhook(payload);
  },
};
