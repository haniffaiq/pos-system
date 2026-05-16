import * as Sentry from "@sentry/node";

type SentryEvent = {
  user?: Record<string, unknown>;
  request?: {
    cookies?: unknown;
    headers?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const SENSITIVE_HEADER_NAMES = new Set(["authorization", "cookie", "set-cookie", "x-api-key"]);

export const scrubPii = (event: SentryEvent): SentryEvent => {
  const scrubbed: SentryEvent = { ...event };

  if (scrubbed.user) {
    const { id } = scrubbed.user;
    scrubbed.user = id === undefined ? {} : { id };
  }

  if (scrubbed.request) {
    const { cookies: _cookies, headers, ...request } = scrubbed.request;
    scrubbed.request = { ...request };

    if (headers) {
      scrubbed.request.headers = Object.fromEntries(
        Object.entries(headers).filter(([name]) => !SENSITIVE_HEADER_NAMES.has(name.toLowerCase())),
      );
    }
  }

  return scrubbed;
};

export const initSentry = () => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrubPii(event as unknown as SentryEvent) as unknown as typeof event,
  });
};

export { Sentry };
