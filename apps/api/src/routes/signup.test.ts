import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { onError } from "../middleware/error";
import { consumeSignup, startSignup } from "../services/signup.service";
import { signupRoutes } from "./signup";

vi.mock("../services/signup.service", () => ({
  startSignup: vi.fn(),
  consumeSignup: vi.fn(),
}));

const startSignupMock = vi.mocked(startSignup);
const consumeSignupMock = vi.mocked(consumeSignup);

function testApp() {
  const app = new Hono();
  app.onError(onError);
  app.route("/api/v1/signup", signupRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RATE_LIMIT_DISABLED = "true";
});

describe("signup routes", () => {
  it("POST /api/v1/signup validates input and starts signup", async () => {
    startSignupMock.mockResolvedValueOnce({ tokenSent: true });

    const response = await testApp().request("/api/v1/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.test",
        password: "secret123",
        businessName: "ABC Grosir",
        slug: "abc-grosir",
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ tokenSent: true });
    expect(startSignupMock).toHaveBeenCalledWith(
      { email: "owner@example.test", password: "secret123", businessName: "ABC Grosir", slug: "abc-grosir" },
      expect.objectContaining({
        insertToken: expect.any(Function),
        isSlugAvailable: expect.any(Function),
        hasActiveSignupForEmail: expect.any(Function),
        enqueue: expect.any(Function),
      }),
    );
  });

  it("POST /api/v1/signup rejects invalid payloads", async () => {
    const response = await testApp().request("/api/v1/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-email", password: "short", businessName: "A", slug: "Bad Slug" }),
    });

    expect(response.status).toBe(400);
    expect(startSignupMock).not.toHaveBeenCalled();
  });

  it("POST /api/v1/signup/verify consumes a valid token", async () => {
    consumeSignupMock.mockResolvedValueOnce({ tenantId: "tenant-1", slug: "abc-grosir" });

    const response = await testApp().request("/api/v1/signup/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(64) }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tenantId: "tenant-1", slug: "abc-grosir" });
    expect(consumeSignupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "a".repeat(64),
        loadToken: expect.any(Function),
        bootstrapTenant: expect.any(Function),
        markConsumed: expect.any(Function),
      }),
    );
  });
});
