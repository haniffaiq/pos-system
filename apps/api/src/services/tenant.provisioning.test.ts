import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryResultRow } from "pg";

const provisioningAdd = vi.hoisted(() => vi.fn());
const hashPassword = vi.hoisted(() => vi.fn(async () => "hashed-password"));
const committed = vi.hoisted(() => ({ value: false }));

vi.mock("../queue/queues", () => ({
  provisioningQueue: { add: provisioningAdd },
}));

vi.mock("../lib/password", () => ({
  hashPassword,
}));

vi.mock("../db/withTenant", () => ({
  withAdmin: vi.fn(async (fn: (q: (text: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => {
    committed.value = false;
    const q = async <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => {
      if (text.includes("select 1 from tenants")) {
        return { rows: [] as unknown as R[], rowCount: 0 };
      }
      if (text.includes("insert into tenants")) {
        return {
          rows: [
            {
              id: "tenant-123",
              name: params?.[0],
              slug: params?.[1],
              sector: params?.[2],
              status: "active",
              created_at: new Date("2026-05-14T00:00:00Z"),
            } as unknown as R,
          ],
          rowCount: 1,
        };
      }
      return { rows: [] as unknown as R[], rowCount: 0 };
    };
    const result = await fn(q);
    committed.value = true;
    return result;
  }),
}));

describe("tenant provisioning enqueue wiring", () => {
  beforeEach(() => {
    provisioningAdd.mockReset();
    hashPassword.mockClear();
    committed.value = false;
  });

  it("enqueues tenant provisioning after createTenant commits with a stable jobId", async () => {
    provisioningAdd.mockImplementation(() => {
      expect(committed.value).toBe(true);
      return Promise.resolve({ id: "tenant-provisioning-tenant-123" });
    });
    const { createTenant } = await import("./tenant.service");

    const tenant = await createTenant(
      {
        name: "Provisioned Grosir",
        slug: "provisioned-grosir",
        sector: "grosir",
        ownerEmail: "owner@example.test",
        ownerPassword: "secret123",
      },
      "admin-1",
    );

    expect(tenant.id).toBe("tenant-123");
    expect(provisioningAdd).toHaveBeenCalledWith(
      "provision",
      { tenantId: "tenant-123" },
      { jobId: "tenant-provisioning-tenant-123" },
    );
  });
});
