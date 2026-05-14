import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "./index";
import { AppError } from "./lib/errors";
import { onError } from "./middleware/error";

describe("api app skeleton", () => {
  it("responds to /health", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
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
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
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
    expect(consoleError).toHaveBeenCalledOnce();

    consoleError.mockRestore();
  });
});
