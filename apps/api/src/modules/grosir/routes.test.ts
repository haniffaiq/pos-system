import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Sector, TenantStatus } from "@app/shared";
import { app } from "../../index";
import { signAccess } from "../../lib/jwt";
import { getModule } from "../registry";
import { grosirRouter } from "./index";
import "./index";

const { withAdminMock } = vi.hoisted(() => ({
  withAdminMock: vi.fn(),
}));

vi.mock("../../db/withTenant", () => ({
  withAdmin: withAdminMock,
}));

interface TenantLookupRow {
  sector: Sector;
  status: TenantStatus;
}

function tenantRow(sector: Sector = "grosir", status: TenantStatus = "active"): TenantLookupRow {
  return { sector, status };
}

function mockTenantLookup(row: TenantLookupRow | undefined) {
  withAdminMock.mockImplementationOnce(async (fn) =>
    fn(async () => ({ rows: row ? [row] : [] })),
  );
}

async function tenantToken(tenantId: string, role: "owner" | "manager" | "cashier" = "owner") {
  return signAccess({ sub: "user-1", tenantId, role });
}

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("grosir module registration", () => {
  it("registers itself in the module registry", () => {
    const mod = getModule("grosir");

    expect(mod).toBeDefined();
    expect(mod?.sector).toBe("grosir");
    expect(mod?.router).toBe(grosirRouter);
  });

  it("keeps registration idempotent when imported more than once", async () => {
    await import("./index");
    await import("./index");

    expect(getModule("grosir")?.router).toBe(grosirRouter);
  });
});

describe("grosir module tenant routing", () => {
  it("reattaches auth context when reached through tenant router delegation", async () => {
    const tenantId = "00000000-0000-4000-8000-000000000001";
    const token = await tenantToken(tenantId, "manager");
    mockTenantLookup(tenantRow("grosir"));

    grosirRouter.get("/__smoke", (c) => {
      const auth = c.get("auth");
      return c.json({ module: "grosir", tenantId: auth.tenantId, role: auth.role });
    });

    const response = await app.request(`/api/v1/t/${tenantId}/m/__smoke`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ module: "grosir", tenantId, role: "manager" });
  });
});
