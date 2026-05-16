import { AppError } from "../errors";
import { midtransProvider } from "./midtrans";
import { xenditProvider } from "./xendit";

export type PspProvider = "midtrans" | "xendit";

export type CheckoutInput = {
  orderId: string;
  amountIdr: number;
  customerEmail: string;
  customerName?: string;
  description?: string;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
};

export type CheckoutResult = {
  provider: PspProvider;
  orderId: string;
  redirectUrl: string;
  token?: string;
  providerInvoiceId?: string;
  status?: string;
};

export type PaymentProvider = {
  name: PspProvider;
  configured: (env?: NodeJS.ProcessEnv) => boolean;
  missingConfig: (env?: NodeJS.ProcessEnv) => string[];
  createCheckout: (input: CheckoutInput, env?: NodeJS.ProcessEnv) => Promise<CheckoutResult>;
  getStatus: (orderId: string, env?: NodeJS.ProcessEnv) => Promise<unknown>;
  verifyWebhook: (...args: unknown[]) => boolean;
  parseWebhook: (body: unknown) => unknown;
};

export type ProviderConfig = {
  name: PspProvider;
  configured: boolean;
  missingConfig: string[];
};

export type ProviderResolution = {
  activePsp: PspProvider;
  effectivePsp: PspProvider;
  fallbackPsp?: PspProvider;
  provider: PaymentProvider;
  missingConfig: string[];
};

export type AdminProviderConfig = {
  activePsp: PspProvider | null;
  effectivePsp: PspProvider | null;
  fallbackPsp?: PspProvider;
  providers: ProviderConfig[];
  error?: {
    code: "BILLING_CONFIG_INVALID" | "BILLING_PSP_NOT_CONFIGURED";
    message: string;
    details?: unknown;
  };
};

type Logger = {
  warn: (entry: { event: "billing_psp_fallback"; activePsp: PspProvider; fallbackPsp: PspProvider; missingConfig: string[] }) => void;
};

type ResolveOptions = {
  env?: NodeJS.ProcessEnv;
  providers?: PaymentProvider[];
  logger?: Logger;
};

const DEFAULT_PSP: PspProvider = "midtrans";
const PSP_VALUES = ["midtrans", "xendit"] as const;
const loggedFallbacks = new Set<string>();

export const paymentProviders: PaymentProvider[] = [
  {
    name: "midtrans",
    configured: (env = process.env) => midtransProvider.configured(env),
    missingConfig: (env = process.env) => midtransProvider.missingConfig(env),
    createCheckout: async (input, env = process.env) => midtransProvider.createCheckout(input, env),
    getStatus: (orderId, env = process.env) => midtransProvider.getStatus(orderId, env),
    verifyWebhook: (...args) => midtransProvider.verifyWebhook(args[0] as never, args[1] as never),
    parseWebhook: (body) => midtransProvider.parseWebhook(body as never),
  },
  {
    name: "xendit",
    configured: (env = process.env) => xenditProvider.configured(env),
    missingConfig: (env = process.env) => xenditProvider.missingConfig(env),
    createCheckout: async (input, env = process.env) => xenditProvider.createCheckout(input, env),
    getStatus: (orderId, env = process.env) => xenditProvider.getStatus(orderId, env),
    verifyWebhook: (...args) => xenditProvider.verifyWebhook(args[0] as never, args[1] as never),
    parseWebhook: (body) => xenditProvider.parseWebhook(body as never),
  },
];

export function resolvePaymentProvider(options: ResolveOptions = {}): ProviderResolution {
  const env = options.env ?? process.env;
  const providers = options.providers ?? paymentProviders;
  const activePsp = readActivePsp(env);
  const ordered = orderProviders(activePsp, providers);
  const active = ordered[0];
  const activeMissing = active.missingConfig(env);

  if (active.configured(env)) {
    return { activePsp, effectivePsp: active.name, provider: active, missingConfig: [] };
  }

  const fallback = ordered[1];
  if (fallback?.configured(env)) {
    logFallbackOnce(options.logger, active.name, fallback.name, activeMissing);
    return {
      activePsp,
      effectivePsp: fallback.name,
      fallbackPsp: fallback.name,
      provider: fallback,
      missingConfig: activeMissing,
    };
  }

  throw new AppError(500, "BILLING_PSP_NOT_CONFIGURED", "No billing payment provider is fully configured", {
    missingConfig: missingConfigByProvider(providers, env),
  });
}

export function getPaymentProviderConfig(env: NodeJS.ProcessEnv = process.env): AdminProviderConfig {
  const providers = paymentProviders;
  const activeValue = env.BILLING_ACTIVE_PSP?.trim() || DEFAULT_PSP;
  const providerConfig = providers.map((provider) => ({
    name: provider.name,
    configured: provider.configured(env),
    missingConfig: provider.missingConfig(env),
  }));

  if (!isPspProvider(activeValue)) {
    return {
      activePsp: null,
      effectivePsp: null,
      providers: providerConfig,
      error: {
        code: "BILLING_CONFIG_INVALID",
        message: `Invalid BILLING_ACTIVE_PSP: ${activeValue}`,
        details: { activePsp: activeValue, allowed: PSP_VALUES },
      },
    };
  }

  const active = providerConfig.find((provider) => provider.name === activeValue);
  const fallback = providerConfig.find((provider) => provider.name !== activeValue);
  const effective = active?.configured ? active : fallback?.configured ? fallback : undefined;

  return {
    activePsp: activeValue,
    effectivePsp: effective?.name ?? null,
    ...(effective && effective.name !== activeValue ? { fallbackPsp: effective.name } : {}),
    providers: providerConfig,
    ...(!effective
      ? {
          error: {
            code: "BILLING_PSP_NOT_CONFIGURED" as const,
            message: "No billing payment provider is fully configured",
            details: { missingConfig: missingConfigByProvider(providers, env) },
          },
        }
      : {}),
  };
}

function readActivePsp(env: NodeJS.ProcessEnv): PspProvider {
  const active = env.BILLING_ACTIVE_PSP?.trim() || DEFAULT_PSP;
  if (!isPspProvider(active)) {
    throw new AppError(500, "BILLING_CONFIG_INVALID", `Invalid BILLING_ACTIVE_PSP: ${active}`, {
      activePsp: active,
      allowed: PSP_VALUES,
    });
  }
  return active;
}

function isPspProvider(value: string): value is PspProvider {
  return (PSP_VALUES as readonly string[]).includes(value);
}

function orderProviders(activePsp: PspProvider, providers: PaymentProvider[]): [PaymentProvider, PaymentProvider | undefined] {
  const active = providers.find((provider) => provider.name === activePsp);
  const fallback = providers.find((provider) => provider.name !== activePsp);
  if (!active) {
    throw new AppError(500, "BILLING_CONFIG_INVALID", `Payment provider ${activePsp} is not registered`);
  }
  return [active, fallback];
}

function missingConfigByProvider(providers: PaymentProvider[], env: NodeJS.ProcessEnv): Record<PspProvider, string[]> {
  return providers.reduce(
    (acc, provider) => ({ ...acc, [provider.name]: provider.missingConfig(env) }),
    {} as Record<PspProvider, string[]>,
  );
}

function logFallbackOnce(logger: Logger | undefined, activePsp: PspProvider, fallbackPsp: PspProvider, missingConfig: string[]) {
  const key = `${activePsp}:${fallbackPsp}:${missingConfig.join(",")}`;
  if (loggedFallbacks.has(key)) {
    return;
  }
  loggedFallbacks.add(key);
  (logger ?? console).warn({ event: "billing_psp_fallback", activePsp, fallbackPsp, missingConfig });
}
