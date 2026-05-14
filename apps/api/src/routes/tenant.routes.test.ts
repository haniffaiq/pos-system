import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Sector, TenantStatus } from "@app/shared";
import { app as mountedApp } from "../index";
import { signAccess } from "../lib/jwt";
import { onError } from "../middleware/error";
import { tenantRoutes } from "./tenant.routes";

const { withAdminMock } = vi.hoisted(() => ({
  withAdminMock: vi.fn(),
}));

vi.mock("../db/withTenant", () => ({
  withAdmin: withAdminMock,
}));

interface TenantLookupRow {
  sector: Sector;
  status: TenantStatus;
}

function tenantRow(sector: Sector = "grosir", status: TenantStatus = "active"): TenantLookupRow {
  return { sector, status };
}

function testApp() {
  const app = new Hono();
  app.onError(onError);
  app.route("/api/v1/t", tenantRoutes);
  return app;
}

async function tenantToken(tenantId: string, role: "owner" | "manager" | "cashier" = "owner") {
  return signAccess({ sub: "user-1", tenantId, role });
}

async function platformAdminToken() {
  return signAccess({ sub: "admin-1", tenantId: null, role: "platform_admin" });
}

function mockTenantLookup(row: TenantLookupRow | undefined) {
  withAdminMock.mockImplementationOnce(async (fn) =>
    fn(async () => ({ rows: row ? [row] : [] })),
  );
}

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant routes", () => {
  it("rejects a token whose tenantId differs from the path", async () => {
    const token = await tenantToken("00000000-0000-4000-8000-000000000001");

    const response = await testApp().request("/api/v1/t/00000000-0000-4000-8000-000000000002/me", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(withAdminMock).not.toHaveBeenCalled();
  });

  it("rejects platform_admin tokens from tenant routes", async () => {
    const token = await platformAdminToken();

    const response = await testApp().request("/api/v1/t/00000000-0000-4000-8000-000000000001/me", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(withAdminMock).not.toHaveBeenCalled();
  });

  it("rejects missing tenants", async () => {
    const tenantId = "00000000-0000-4000-8000-000000000001";
    const token = await tenantToken(tenantId);
    mockTenantLookup(undefined);

    const response = await testApp().request(`/api/v1/t/${tenantId}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("rejects suspended tenants", async () => {
    const tenantId = "00000000-0000-4000-8000-000000000001";
    const token = await tenantToken(tenantId);
    mockTenantLookup(tenantRow("grosir", "suspended"));

    const response = await testApp().request(`/api/v1/t/${tenantId}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "tenant_suspended" } });
  });

  it("returns the current context for a matching token", async () => {
    const tenantId = "00000000-0000-4000-8000-000000000001";
    const token = await tenantToken(tenantId, "manager");
    mockTenantLookup(tenantRow("retail"));

    const response = await testApp().request(`/api/v1/t/${tenantId}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      tenantId,
      role: "manager",
      sector: "retail",
    });
  });

  it("returns module_coming_soon for sectors without a registered module", async () => {
    const tenantId = "00000000-0000-4000-8000-000000000001";
    const token = await tenantToken(tenantId);
    mockTenantLookup(tenantRow("apotek"));

    const response = await testApp().request(`/api/v1/t/${tenantId}/m/dashboard`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "module_coming_soon",
        message: "This sector module is not available yet",
      },
    });
  });

  it("is mounted by the API app", async () => {
    const tenantId = "00000000-0000-4000-8000-000000000001";
    const token = await tenantToken(tenantId);
    mockTenantLookup(tenantRow("grosir"));

    const response = await mountedApp.request(`/api/v1/t/${tenantId}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
  });
});
