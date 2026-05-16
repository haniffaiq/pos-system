import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../lib/logger";
import { requestLogger } from "./requestLogger";

describe("requestLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches a generated request id to context, response headers, and log fields", async () => {
    const childLogger = { info: vi.fn() };
    const child = vi.spyOn(logger, "child").mockReturnValue(childLogger as never);
    const app = new Hono();

    app.use("*", requestLogger);
    app.get("/x", (c) => c.json({ requestId: c.get("requestId") }));

    const res = await app.request("/x");

    const requestId = res.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(res.json()).resolves.toEqual({ requestId });
    expect(child).toHaveBeenCalledWith({ request_id: requestId });
    expect(childLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/x",
        route: "/x",
        status: 200,
        duration_ms: expect.any(Number),
        latency_ms: expect.any(Number),
      }),
      "request completed",
    );
  });

  it("preserves an inbound request id and logs safe tenant/user context only", async () => {
    const childLogger = { info: vi.fn() };
    vi.spyOn(logger, "child").mockReturnValue(childLogger as never);
    const app = new Hono();

    app.use("*", requestLogger);
    app.get("/tenants/:tenantId/users/:userId", (c) => {
      c.set("auth", {
        sub: "user-123",
        tenantId: "tenant-456",
        role: "owner",
        email: "owner@example.com",
      });
      return c.text("ok", 201);
    });

    const res = await app.request("/tenants/tenant-456/users/user-123?token=secret", {
      headers: { "x-request-id": "req-safe-1", authorization: "Bearer secret-token" },
    });

    expect(res.headers.get("x-request-id")).toBe("req-safe-1");
    const logFields = childLogger.info.mock.calls[0][0];
    expect(logFields).toEqual(
      expect.objectContaining({
        method: "GET",
        path: "/tenants/:tenantId/users/:userId",
        route: "/tenants/:tenantId/users/:userId",
        status: 201,
        tenant_id: "tenant-456",
        user_id: "user-123",
      }),
    );
    expect(JSON.stringify(logFields)).not.toContain("owner@example.com");
    expect(JSON.stringify(logFields)).not.toContain("secret");
    expect(JSON.stringify(logFields)).not.toContain("token");
  });
});
