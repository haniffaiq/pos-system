import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  adminQuery: vi.fn(),
  redisPing: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logChild: vi.fn(),
}));

vi.mock("./db/pool", () => ({
  adminPool: { query: mocks.adminQuery },
  tenantPool: { query: vi.fn() },
}));

vi.mock("./lib/redis", () => ({
  redis: { ping: mocks.redisPing },
  bullConnection: {},
  appNamespace: "test",
}));

vi.mock("./lib/logger", () => ({
  logger: { error: mocks.logError, info: vi.fn(), child: mocks.logChild },
  toLogError: (error: unknown) => (error instanceof Error ? { name: error.name } : { name: typeof error }),
}));

import { app } from "./index";
import { AppError } from "./lib/errors";
import { onError } from "./middleware/error";

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock("./lib/sentry.js", () => ({
  initSentry: vi.fn(),
  Sentry: {
    captureException: captureExceptionMock,
  },
}));

describe("api app skeleton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminQuery.mockResolvedValue({ rows: [{ healthcheck: 1 }] });
    mocks.redisPing.mockResolvedValue("PONG");
    mocks.logChild.mockReturnValue({ info: mocks.logInfo });
  });

  it("responds to /health", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("responds to /healthz without checking dependencies", async () => {
    const response = await app.request("/healthz");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(mocks.adminQuery).not.toHaveBeenCalled();
    expect(mocks.redisPing).not.toHaveBeenCalled();
  });

  it("reports ready when Postgres and Redis checks pass", async () => {
    const response = await app.request("/readyz");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { postgres: "ok", redis: "ok" },
    });
    expect(mocks.adminQuery).toHaveBeenCalledWith("select 1 as healthcheck");
    expect(mocks.redisPing).toHaveBeenCalledOnce();
  });

  it("reports not ready when any dependency check fails", async () => {
    mocks.redisPing.mockRejectedValueOnce(new Error("connection refused"));

    const response = await app.request("/readyz");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      checks: { postgres: "ok", redis: "error" },
    });
  });

  it("allows browser clients to call the API from the web origin", async () => {
    const response = await app.request("/api/v1/auth/admin-login", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,authorization",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });
});

describe("Hono error middleware", () => {
  it("returns the uniform error shape for AppError with its status", async () => {
    const testApp = new Hono();
    testApp.onError(onError);
    testApp.get("/missing", () => {
      throw new AppError(404, "not_found", "Tenant not found", { tenantId: "missing" });
    });

    const response = await testApp.request("/missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: "Tenant not found",
        details: { tenantId: "missing" },
      },
    });
  });

  it("returns validation_error with details for ZodError", async () => {
    const testApp = new Hono();
    testApp.onError(onError);
    testApp.get("/validate", () => {
      z.object({ name: z.string().min(1) }).parse({ name: "" });
      return new Response(null);
    });

    const response = await testApp.request("/validate");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
    expect(body.error.message).toBe("Invalid input");
    expect(body.error.details.fieldErrors.name).toEqual(["String must contain at least 1 character(s)"]);
  });

  it("sanitizes unknown errors as internal_error and logs the original error", async () => {
    captureExceptionMock.mockClear();
    const testApp = new Hono();
    testApp.onError(onError);
    testApp.get("/boom", () => {
      throw new Error("database password leaked");
    });

    const response = await testApp.request("/boom");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal_error", message: "Something went wrong" },
    });
    expect(mocks.logError).toHaveBeenCalledOnce();
    expect(mocks.logError).toHaveBeenCalledWith({ error: { name: "Error" } }, "unhandled request error");
    expect(captureExceptionMock).toHaveBeenCalledOnce();
    expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error));
  });
});
