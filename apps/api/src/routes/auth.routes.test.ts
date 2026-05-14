import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app as mountedApp } from "../index";
import { onError } from "../middleware/error";
import { authRoutes } from "./auth.routes";
import { loginPlatformAdmin, loginTenantUser, logout, refresh } from "../services/auth.service";

vi.mock("../services/auth.service", () => ({
  loginTenantUser: vi.fn(),
  loginPlatformAdmin: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));

const loginTenantUserMock = vi.mocked(loginTenantUser);
const loginPlatformAdminMock = vi.mocked(loginPlatformAdmin);
const refreshMock = vi.mocked(refresh);
const logoutMock = vi.mocked(logout);

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
  it("POST /tenant-login returns tenant user tokens", async () => {
    loginTenantUserMock.mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: "user-1", tenantId: "tenant-1", email: "u@routeco.test", name: "U", role: "manager" },
    });

    const response = await testApp().request("/api/v1/auth/tenant-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "routeco", email: "u@routeco.test", password: "secret12" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: "user-1", tenantId: "tenant-1", email: "u@routeco.test", name: "U", role: "manager" },
    });
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

  it("POST /admin-login returns platform admin tokens", async () => {
    loginPlatformAdminMock.mockResolvedValueOnce({
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      admin: { id: "admin-1", email: "admin@example.test", name: "Admin" },
    });

    const response = await testApp().request("/api/v1/auth/admin-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.test", password: "admin123" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      admin: { id: "admin-1", email: "admin@example.test", name: "Admin" },
    });
    expect(loginPlatformAdminMock).toHaveBeenCalledWith("admin@example.test", "admin123");
  });

  it("POST /refresh rotates refresh tokens", async () => {
    refreshMock.mockResolvedValueOnce({ accessToken: "new-access", refreshToken: "new-refresh" });

    const response = await testApp().request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "old-refresh" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accessToken: "new-access", refreshToken: "new-refresh" });
    expect(refreshMock).toHaveBeenCalledWith("old-refresh");
  });

  it("POST /logout revokes the refresh token", async () => {
    logoutMock.mockResolvedValueOnce(undefined);

    const response = await testApp().request("/api/v1/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-token" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(logoutMock).toHaveBeenCalledWith("refresh-token");
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
