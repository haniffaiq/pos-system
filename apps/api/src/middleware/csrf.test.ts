import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signAccess, signRefresh } from "../lib/jwt";
import { onError } from "./error";
import { csrfMiddleware } from "./csrf";

const mocks = vi.hoisted(() => ({
  isCsrfBoundToRefresh: vi.fn(),
}));

vi.mock("../lib/refreshStore", () => ({
  isCsrfBoundToRefresh: mocks.isCsrfBoundToRefresh,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
  process.env.REFRESH_TOKEN_TTL = "1209600";
  mocks.isCsrfBoundToRefresh.mockResolvedValue(true);
});

function makeApp() {
  const app = new Hono();
  app.onError(onError);
  app.use("*", csrfMiddleware);
  app.post("/api/v1/auth/tenant-login", (c) => c.json({ ok: true }));
  app.post("/api/v1/t/demo/orders", (c) => c.json({ ok: true }));
  return app;
}

describe("csrfMiddleware", () => {
  it("allows unauthenticated auth bootstrap unsafe routes without CSRF", async () => {
    const response = await makeApp().request("/api/v1/auth/tenant-login", { method: "POST" });

    expect(response.status).toBe(200);
  });

  it("rejects cookie-auth unsafe browser requests without a matching csrf header", async () => {
    const { token: refreshToken, jti } = await signRefresh({ sub: "user-1", tenantId: "tenant-1", role: "manager" });
    const accessToken = await signAccess({ sub: "user-1", tenantId: "tenant-1", role: "manager", sessionJti: jti });

    const response = await makeApp().request("/api/v1/t/demo/orders", {
      method: "POST",
      headers: { cookie: `brs_access=${accessToken}; brs_refresh=${refreshToken}; brs_csrf=csrf-1` },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "csrf_invalid", message: "Invalid CSRF token" } });
    expect(mocks.isCsrfBoundToRefresh).not.toHaveBeenCalled();
  });

  it("rejects matching double-submit tokens that are not bound to the session jti", async () => {
    mocks.isCsrfBoundToRefresh.mockResolvedValueOnce(false);
    const { token: refreshToken, jti } = await signRefresh({ sub: "user-1", tenantId: "tenant-1", role: "manager" });
    const accessToken = await signAccess({ sub: "user-1", tenantId: "tenant-1", role: "manager", sessionJti: jti });

    const response = await makeApp().request("/api/v1/t/demo/orders", {
      method: "POST",
      headers: {
        cookie: `brs_access=${accessToken}; brs_refresh=${refreshToken}; brs_csrf=attacker-token`,
        "x-csrf-token": "attacker-token",
      },
    });

    expect(response.status).toBe(403);
    expect(mocks.isCsrfBoundToRefresh).toHaveBeenCalledWith("user-1", jti, "attacker-token");
  });

  it("allows cookie-auth unsafe browser requests with matching and session-bound CSRF", async () => {
    const { token: refreshToken, jti } = await signRefresh({ sub: "user-1", tenantId: "tenant-1", role: "manager" });
    const accessToken = await signAccess({ sub: "user-1", tenantId: "tenant-1", role: "manager", sessionJti: jti });

    const response = await makeApp().request("/api/v1/t/demo/orders", {
      method: "POST",
      headers: {
        cookie: `brs_access=${accessToken}; brs_refresh=${refreshToken}; brs_csrf=csrf-1`,
        "x-csrf-token": "csrf-1",
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.isCsrfBoundToRefresh).toHaveBeenCalledWith("user-1", jti, "csrf-1");
  });
});
