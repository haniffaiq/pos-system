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

    const inboundRequestId = "018f8f2a-53f5-7f4f-8f73-51c7e1b11111";
    const res = await app.request("/tenants/tenant-456/users/user-123?token=secret", {
      headers: { "x-request-id": inboundRequestId, authorization: "Bearer secret-token" },
    });

    expect(res.headers.get("x-request-id")).toBe(inboundRequestId);
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

  it("replaces unsafe inbound request ids before echoing or logging them", async () => {
    const childLogger = { info: vi.fn() };
    const child = vi.spyOn(logger, "child").mockReturnValue(childLogger as never);
    const app = new Hono();

    app.use("*", requestLogger);
    app.get("/x", (c) => c.text(c.get("requestId")));

    const res = await app.request("/x", {
      headers: { "x-request-id": "owner@example.com secret-token" },
    });

    const requestId = res.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(res.text()).resolves.toBe(requestId);
    expect(child).toHaveBeenCalledWith({ request_id: requestId });
    expect(JSON.stringify(childLogger.info.mock.calls[0][0])).not.toContain("owner@example.com");
    expect(JSON.stringify(childLogger.info.mock.calls[0][0])).not.toContain("secret-token");
  });

  it("logs a generic path for unmatched routes instead of raw URL segments", async () => {
    const childLogger = { info: vi.fn() };
    vi.spyOn(logger, "child").mockReturnValue(childLogger as never);
    const app = new Hono();

    app.use("*", requestLogger);

    const res = await app.request("/users/owner@example.com/reset/secret-token?token=secret");

    expect(res.status).toBe(404);
    const logFields = childLogger.info.mock.calls[0][0];
    expect(logFields).toEqual(expect.objectContaining({ status: 404, path: "/*", route: "/*" }));
    expect(JSON.stringify(logFields)).not.toContain("owner@example.com");
    expect(JSON.stringify(logFields)).not.toContain("secret-token");
    expect(JSON.stringify(logFields)).not.toContain("token=secret");
  });

  it("logs the final error status when downstream handlers throw", async () => {
    const childLogger = { info: vi.fn() };
    vi.spyOn(logger, "child").mockReturnValue(childLogger as never);
    const app = new Hono();

    app.use("*", requestLogger);
    app.onError((_err, c) => c.json({ error: "boom" }, 500));
    app.get("/boom", () => {
      throw new Error("boom");
    });

    const res = await app.request("/boom");

    expect(res.status).toBe(500);
    expect(childLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500, path: "/boom", route: "/boom" }),
      "request completed",
    );
  });
});
