import { afterEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();

vi.mock("@sentry/node", () => ({
  init: initMock,
  captureException: vi.fn(),
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("api Sentry init", () => {
  it("does not initialize Sentry when SENTRY_DSN is empty", async () => {
    delete process.env.SENTRY_DSN;
    const { initSentry } = await import("./sentry.js");

    initSentry();

    expect(initMock).not.toHaveBeenCalled();
  });

  it("initializes Sentry with DSN, release, environment, and PII scrubbing", async () => {
    process.env.SENTRY_DSN = "https://public@example.test/1";
    process.env.SENTRY_RELEASE = "api@1.2.3";
    process.env.SENTRY_ENVIRONMENT = "staging";
    const { initSentry } = await import("./sentry.js");

    initSentry();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.test/1",
        release: "api@1.2.3",
        environment: "staging",
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
