import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/withTenant", () => ({
  withAdmin: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn(async (c, next) => {
    c.set("auth", { sub: "user-1", tenantId: "tenant-1", role: "owner" });
    await next();
  }),
}));

vi.mock("../services/email.service", () => ({
  sendMfaEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/mfa.service", () => ({
  issueEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
}));

import { withAdmin } from "../db/withTenant";
import { onError } from "../middleware/error";
import { sendMfaEmail } from "../services/email.service";
import { issueEmailOtp, verifyEmailOtp } from "../services/mfa.service";
import { authRoutes } from "./auth.routes";

const withAdminMock = vi.mocked(withAdmin);
const issueEmailOtpMock = vi.mocked(issueEmailOtp);
const verifyEmailOtpMock = vi.mocked(verifyEmailOtp);
const sendMfaEmailMock = vi.mocked(sendMfaEmail);

function testApp() {
  const app = new Hono();
  app.onError(onError);
  app.route("/api/v1/auth", authRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  withAdminMock.mockImplementation(async (fn) => fn(async () => ({ rows: [{ email: "owner@example.test" }] })));
});

describe("auth MFA email OTP routes", () => {
  it("issues and emails an OTP for the authenticated user without returning the code", async () => {
    issueEmailOtpMock.mockResolvedValueOnce("123456");

    const response = await testApp().request("/api/v1/auth/mfa/email-otp/send", { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: true });
    expect(issueEmailOtpMock).toHaveBeenCalledWith("user-1");
    expect(sendMfaEmailMock).toHaveBeenCalledWith("owner@example.test", "123456", "user-1");
  });

  it("verifies a valid email OTP for the authenticated user", async () => {
    verifyEmailOtpMock.mockResolvedValueOnce(true);

    const response = await testApp().request("/api/v1/auth/mfa/email-otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(verifyEmailOtpMock).toHaveBeenCalledWith("user-1", "123456");
  });

  it("rejects an invalid email OTP", async () => {
    verifyEmailOtpMock.mockResolvedValueOnce(false);

    const response = await testApp().request("/api/v1/auth/mfa/email-otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "000000" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_otp" } });
  });
});
