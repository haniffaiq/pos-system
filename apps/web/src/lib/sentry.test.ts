import { afterEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  init: initMock,
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("web Sentry init", () => {
  it("does not initialize Sentry when NEXT_PUBLIC_SENTRY_DSN is empty", async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const { initSentry } = await import("./sentry");

    initSentry();

    expect(initMock).not.toHaveBeenCalled();
  });

  it("initializes Sentry with DSN, release, environment, and PII scrubbing", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.test/2";
    process.env.NEXT_PUBLIC_SENTRY_RELEASE = "web@1.2.3";
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = "production";
    const { initSentry } = await import("./sentry");

    initSentry();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.test/2",
        release: "web@1.2.3",
        environment: "production",
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
      }),
    );

    const options = initMock.mock.calls[0]?.[0];
    const scrubbed = options.beforeSend({
      user: { id: "user-1", email: "owner@example.test", ip_address: "127.0.0.1" },
      request: {
        cookies: { session: "secret" },
        headers: { authorization: "Bearer secret", cookie: "session=secret", "x-request-id": "req-1" },
      },
    });

    expect(scrubbed.user).toEqual({ id: "user-1" });
    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.headers).toEqual({ "x-request-id": "req-1" });
  });
});
