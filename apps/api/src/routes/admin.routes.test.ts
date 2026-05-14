import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { app as mountedApp } from "../index";
import { signAccess } from "../lib/jwt";
import { onError } from "../middleware/error";
import { createTenant, getTenant, listAuditLog, listTenants, setTenantStatus } from "../services/tenant.service";
import { adminRoutes } from "./admin.routes";

vi.mock("../services/tenant.service", () => ({
  createTenant: vi.fn(),
  listTenants: vi.fn(),
  listAuditLog: vi.fn(),
  getTenant: vi.fn(),
  setTenantStatus: vi.fn(),
}));

const createTenantMock = vi.mocked(createTenant);
const listTenantsMock = vi.mocked(listTenants);
const listAuditLogMock = vi.mocked(listAuditLog);
const getTenantMock = vi.mocked(getTenant);
const setTenantStatusMock = vi.mocked(setTenantStatus);

function testApp() {
  const app = new Hono();
  app.onError(onError);
  app.route("/api/v1/admin", adminRoutes);
  return app;
}

async function platformAdminToken() {
  return signAccess({ sub: "admin-1", tenantId: null, role: "platform_admin" });
}

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin routes", () => {
  it("rejects missing credentials with 401", async () => {
    const response = await testApp().request("/api/v1/admin/tenants");

    expect(response.status).toBe(401);
    expect(listTenantsMock).not.toHaveBeenCalled();
  });

  it("rejects a tenant-role token with 403", async () => {
    const token = await signAccess({ sub: "user-1", tenantId: "tenant-1", role: "owner" });

    const response = await testApp().request("/api/v1/admin/tenants", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(listTenantsMock).not.toHaveBeenCalled();
  });

  it("lists tenants for a platform admin with validated filters", async () => {
    const token = await platformAdminToken();
    listTenantsMock.mockResolvedValueOnce([
      {
        id: "tenant-1",
        name: "Admin Route Co",
        slug: "admin-route-co",
        sector: "grosir",
        status: "active",
        created_at: new Date("2026-05-14T00:00:00.000Z"),
      },
    ]);

    const response = await testApp().request("/api/v1/admin/tenants?status=active&search=admin", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: "tenant-1",
        name: "Admin Route Co",
        slug: "admin-route-co",
        sector: "grosir",
        status: "active",
        created_at: "2026-05-14T00:00:00.000Z",
      },
    ]);
    expect(listTenantsMock).toHaveBeenCalledWith({ status: "active", search: "admin" });
  });

  it("rejects invalid tenant list filters with 400", async () => {
    const token = await platformAdminToken();

    const response = await testApp().request("/api/v1/admin/tenants?status=paused", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(400);
    expect(listTenantsMock).not.toHaveBeenCalled();
  });

  it("lists platform audit log entries for a platform admin", async () => {
    const token = await platformAdminToken();
    listAuditLogMock.mockResolvedValueOnce([
      {
        id: "audit-1",
        admin_id: "admin-1",
        action: "tenant.create",
        target: "tenant-1",
        meta: { source: "test" },
        created_at: new Date("2026-05-14T00:00:00.000Z"),
      },
    ]);

    const response = await testApp().request("/api/v1/admin/audit-log", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: "audit-1",
        admin_id: "admin-1",
        action: "tenant.create",
        target: "tenant-1",
        meta: { source: "test" },
        created_at: "2026-05-14T00:00:00.000Z",
      },
    ]);
    expect(listAuditLogMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a tenant-role token from audit log with 403", async () => {
    const token = await signAccess({ sub: "user-1", tenantId: "tenant-1", role: "owner" });

    const response = await testApp().request("/api/v1/admin/audit-log", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(listAuditLogMock).not.toHaveBeenCalled();
  });

  it("creates a tenant for a platform admin", async () => {
    const token = await platformAdminToken();
    const input = {
      name: "Admin Route Co",
      slug: "admin-route-co",
      sector: "grosir" as const,
      ownerEmail: "owner@arc.test",
      ownerPassword: "secret12",
    };
    createTenantMock.mockResolvedValueOnce({
      id: "tenant-1",
      name: input.name,
      slug: input.slug,
      sector: input.sector,
      status: "active",
      created_at: new Date("2026-05-14T00:00:00.000Z"),
    });

    const response = await testApp().request("/api/v1/admin/tenants", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "tenant-1",
      name: input.name,
      slug: input.slug,
      sector: input.sector,
      status: "active",
      created_at: "2026-05-14T00:00:00.000Z",
    });
    expect(createTenantMock).toHaveBeenCalledWith(input, "admin-1");
  });

  it("rejects invalid tenant create input with 400", async () => {
    const token = await platformAdminToken();

    const response = await testApp().request("/api/v1/admin/tenants", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: "A",
        slug: "Bad Slug",
        sector: "spaceship",
        ownerEmail: "not-email",
        ownerPassword: "short",
      }),
    });

    expect(response.status).toBe(400);
    expect(createTenantMock).not.toHaveBeenCalled();
  });

  it("gets a tenant by id", async () => {
    const token = await platformAdminToken();
    getTenantMock.mockResolvedValueOnce({
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Admin Route Co",
      slug: "admin-route-co",
      sector: "grosir",
      status: "active",
      created_at: new Date("2026-05-14T00:00:00.000Z"),
      owner: { id: "user-1", email: "owner@arc.test", name: "Owner", role: "owner", status: "active" },
      users: [{ id: "user-1", email: "owner@arc.test", name: "Owner", role: "owner", status: "active" }],
    });

    const response = await testApp().request("/api/v1/admin/tenants/123e4567-e89b-12d3-a456-426614174000", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "123e4567-e89b-12d3-a456-426614174000", slug: "admin-route-co" });
    expect(getTenantMock).toHaveBeenCalledWith("123e4567-e89b-12d3-a456-426614174000");
  });

  it("rejects invalid tenant ids with 400", async () => {
    const token = await platformAdminToken();

    const response = await testApp().request("/api/v1/admin/tenants/not-a-uuid", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(400);
    expect(getTenantMock).not.toHaveBeenCalled();
  });

  it("updates tenant status", async () => {
    const token = await platformAdminToken();
    setTenantStatusMock.mockResolvedValueOnce({
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Admin Route Co",
      slug: "admin-route-co",
      sector: "grosir",
      status: "suspended",
      created_at: new Date("2026-05-14T00:00:00.000Z"),
    });

    const response = await testApp().request("/api/v1/admin/tenants/123e4567-e89b-12d3-a456-426614174000/status", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "suspended" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(setTenantStatusMock).toHaveBeenCalledWith("123e4567-e89b-12d3-a456-426614174000", "suspended", "admin-1");
  });

  it("rejects invalid tenant status updates with 400", async () => {
    const token = await platformAdminToken();

    const response = await testApp().request("/api/v1/admin/tenants/123e4567-e89b-12d3-a456-426614174000/status", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });

    expect(response.status).toBe(400);
    expect(setTenantStatusMock).not.toHaveBeenCalled();
  });

  it("mounts admin routes under /api/v1/admin in the API app", async () => {
    const response = await mountedApp.request("/api/v1/admin/tenants");

    expect(response.status).toBe(401);
  });
});
