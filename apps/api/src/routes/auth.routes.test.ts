import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app as mountedApp } from "../index";
import { onError } from "../middleware/error";
import {
  loginPlatformAdmin,
  loginTenantUser,
  logout,
  refresh,
  sendMfaChallengeEmail,
  verifyMfaChallenge,
} from "../services/auth.service";
import { authRoutes } from "./auth.routes";

vi.mock("../services/auth.service", () => ({
  assertMfaBypassSafe: vi.fn(),
  loginTenantUser: vi.fn(),
  loginPlatformAdmin: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  sendMfaChallengeEmail: vi.fn(),
  verifyMfaChallenge: vi.fn(),
}));

const loginTenantUserMock = vi.mocked(loginTenantUser);
const loginPlatformAdminMock = vi.mocked(loginPlatformAdmin);
const refreshMock = vi.mocked(refresh);
const logoutMock = vi.mocked(logout);
const sendMfaChallengeEmailMock = vi.mocked(sendMfaChallengeEmail);
const verifyMfaChallengeMock = vi.mocked(verifyMfaChallenge);

function testApp() {
  const app = new Hono();
  app.onError(onError);
  app.route("/api/v1/auth", authRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auth routes", () => {
  it("POST /tenant-login sets HTTP-only cookies and returns safe tenant user metadata", async () => {
    loginTenantUserMock.mockResolvedValueOnce({
      type: "authenticated",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      csrfToken: "csrf-token",
      user: { id: "user-1", tenantId: "tenant-1", email: "u@routeco.test", name: "U", role: "manager" },
    });

    const response = await testApp().request("/api/v1/auth/tenant-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "routeco", email: "u@routeco.test", password: "secret12" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: "user-1", tenantId: "tenant-1", email: "u@routeco.test", name: "U", role: "manager" },
    });
    const cookies = response.headers.getSetCookie().join(";");
    expect(cookies).toContain("brs_access=access-token");
    expect(cookies).toContain("brs_refresh=refresh-token");
    expect(cookies).toContain("brs_csrf=");
    expect(cookies).toContain("HttpOnly");
    expect(loginTenantUserMock).toHaveBeenCalledWith("routeco", "u@routeco.test", "secret12");
  });

  it("POST /tenant-login rejects bad input with 400", async () => {
    const response = await testApp().request("/api/v1/auth/tenant-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "routeco", email: "not-an-email", password: "x" }),
    });

    expect(response.status).toBe(400);
    expect(loginTenantUserMock).not.toHaveBeenCalled();
  });

  it("POST /admin-login returns MFA_REQUIRED without auth cookies", async () => {
    loginPlatformAdminMock.mockResolvedValueOnce({
      type: "mfa_required",
      challengeToken: "challenge-1",
      methods: ["totp", "email_otp"],
    });

    const response = await testApp().request("/api/v1/auth/admin-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.test", password: "admin123" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "MFA_REQUIRED",
        message: "Multi-factor authentication is required",
        details: { challengeToken: "challenge-1", methods: ["totp", "email_otp"] },
      },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("POST /refresh requires CSRF for cookie refresh and rotates cookies without returning tokens", async () => {
    const denied = await testApp().request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { cookie: "brs_refresh=old-refresh; brs_csrf=csrf-1" },
    });
    expect(denied.status).toBe(403);
    expect(refreshMock).not.toHaveBeenCalled();

    refreshMock.mockResolvedValueOnce({ accessToken: "new-access", refreshToken: "new-refresh", csrfToken: "new-csrf" });

    const response = await testApp().request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { cookie: "brs_refresh=old-refresh; brs_csrf=csrf-1", "x-csrf-token": "csrf-1" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookies = response.headers.getSetCookie().join(";");
    expect(cookies).toContain("brs_access=new-access");
    expect(cookies).toContain("brs_refresh=new-refresh");
    expect(cookies).toContain("brs_csrf=");
    expect(refreshMock).toHaveBeenCalledWith("old-refresh");
  });

  it("POST /logout requires CSRF, revokes cookie refresh token, and clears auth cookies", async () => {
    const denied = await testApp().request("/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie: "brs_refresh=refresh-token; brs_csrf=csrf-1", "x-csrf-token": "wrong" },
    });
    expect(denied.status).toBe(403);
    expect(logoutMock).not.toHaveBeenCalled();

    logoutMock.mockResolvedValueOnce(undefined);

    const response = await testApp().request("/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie: "brs_refresh=refresh-token; brs_csrf=csrf-1", "x-csrf-token": "csrf-1" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(logoutMock).toHaveBeenCalledWith("refresh-token");
    const cookies = response.headers.getSetCookie().join(";");
    expect(cookies).toContain("brs_access=");
    expect(cookies).toContain("brs_refresh=");
    expect(cookies).toContain("brs_csrf=");
  });

  it("POST /logout is idempotent without a refresh cookie", async () => {
    const response = await testApp().request("/api/v1/auth/logout", { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(logoutMock).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie().join(";")).toContain("brs_refresh=");
  });

  it("sends and verifies pre-cookie MFA challenges", async () => {
    sendMfaChallengeEmailMock.mockResolvedValueOnce(undefined);
    verifyMfaChallengeMock.mockResolvedValueOnce({
      type: "authenticated",
      accessToken: "access-after-mfa",
      refreshToken: "refresh-after-mfa",
      csrfToken: "csrf-after-mfa",
      admin: { id: "admin-1", email: "admin@example.test", name: "Admin" },
    });

    const send = await testApp().request("/api/v1/auth/mfa/challenge/send-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeToken: "challenge-1" }),
    });
    const verify = await testApp().request("/api/v1/auth/mfa/challenge/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeToken: "challenge-1", method: "totp", code: "123456" }),
    });

    expect(send.status).toBe(200);
    expect(await send.json()).toEqual({ sent: true });
    expect(sendMfaChallengeEmailMock).toHaveBeenCalledWith("challenge-1");
    expect(verify.status).toBe(200);
    expect(await verify.json()).toEqual({ admin: { id: "admin-1", email: "admin@example.test", name: "Admin" } });
    expect(verify.headers.getSetCookie().join(";")).toContain("brs_access=access-after-mfa");
    expect(verifyMfaChallengeMock).toHaveBeenCalledWith("challenge-1", "totp", "123456");
  });

  it("mounts auth routes under /api/v1/auth in the API app", async () => {
    const response = await mountedApp.request("/api/v1/auth/tenant-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "routeco", email: "bad", password: "x" }),
    });

    expect(response.status).toBe(400);
  });
});
