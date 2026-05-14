import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { adminPool, tenantPool } from "../db/pool";
import { withAdmin } from "../db/withTenant";
import { AppError } from "../lib/errors";
import { verifyPassword } from "../lib/password";
import { createTenant, getTenant, listTenants, setTenantStatus } from "./tenant.service";

const { provisioningQueueAdd } = vi.hoisted(() => ({
  provisioningQueueAdd: vi.fn(),
}));

vi.mock("../queue/queues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queue/queues")>();
  return {
    ...actual,
    provisioningQueue: {
      add: provisioningQueueAdd,
    },
  };
});

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;

const describeWithDatabase = databaseUrl && databaseAdminUrl ? describe : describe.skip;

describeWithDatabase("tenant.service", () => {
  beforeEach(() => {
    provisioningQueueAdd.mockClear();
  });

  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  async function createPlatformAdmin() {
    const suffix = crypto.randomUUID().slice(0, 8);
    return withAdmin(async (q) => {
      const { rows } = await q<{ id: string }>(
        "insert into platform_admins(email, password_hash, name) values ($1, 'hash', 'Tenant Service Admin') returning id",
        [`tenant-service-${suffix}@example.test`],
      );
      return rows[0]!.id;
    });
  }

  it("creates a tenant with an owner user and audit log in one transaction", async () => {
    const adminId = await createPlatformAdmin();
    const suffix = crypto.randomUUID().slice(0, 8);

    const tenant = await createTenant(
      {
        name: "Sembako Jaya",
        slug: `sembako-jaya-${suffix}`,
        sector: "grosir",
        ownerEmail: `owner-${suffix}@sj.example`,
        ownerPassword: "secret123",
      },
      adminId,
    );

    expect(tenant.id).toBeTruthy();
    expect(tenant.sector).toBe("grosir");
    expect(tenant.status).toBe("active");

    const fetched = await getTenant(tenant.id);
    expect(fetched.owner.email).toBe(`owner-${suffix}@sj.example`);
    expect(fetched.owner.role).toBe("owner");
    expect(fetched.users).toHaveLength(1);

    const stored = await withAdmin(async (q) => {
      const owner = await q<{ password_hash: string }>("select password_hash from users where tenant_id = $1", [tenant.id]);
      const audit = await q<{ action: string; target: string | null }>(
        "select action, target from platform_audit_log where admin_id = $1 and target = $2",
        [adminId, tenant.id],
      );
      return { owner: owner.rows[0]!, audit: audit.rows };
    });

    expect(stored.owner.password_hash).not.toBe("secret123");
    await expect(verifyPassword(stored.owner.password_hash, "secret123")).resolves.toBe(true);
    expect(stored.audit).toEqual([{ action: "tenant.create", target: tenant.id }]);
    expect(provisioningQueueAdd).toHaveBeenCalledWith("provision", { tenantId: tenant.id });
  });

  it("rejects a duplicate slug with 409", async () => {
    const adminId = await createPlatformAdmin();
    const suffix = crypto.randomUUID().slice(0, 8);
    const input = {
      name: "Dup",
      slug: `dup-${suffix}`,
      sector: "grosir" as const,
      ownerEmail: `dup-owner-${suffix}@example.test`,
      ownerPassword: "secret123",
    };

    await createTenant(input, adminId);

    await expect(
      createTenant({ ...input, ownerEmail: `other-${suffix}@example.test` }, adminId),
    ).rejects.toMatchObject<AppError>({ status: 409, code: "slug_taken" });
  });

  it("lists tenants, gets tenants, updates status, and audits status changes", async () => {
    const adminId = await createPlatformAdmin();
    const suffix = crypto.randomUUID().slice(0, 8);
    const tenant = await createTenant(
      {
        name: "Retail Makmur",
        slug: `retail-makmur-${suffix}`,
        sector: "retail",
        ownerEmail: `retail-owner-${suffix}@example.test`,
        ownerPassword: "secret123",
      },
      adminId,
    );

    const all = await listTenants({ search: "Retail Makmur" });
    expect(all.some((row) => row.id === tenant.id)).toBe(true);

    const updated = await setTenantStatus(tenant.id, "suspended", adminId);
    expect(updated.status).toBe("suspended");

    const fetched = await getTenant(tenant.id);
    expect(fetched.status).toBe("suspended");

    const suspended = await listTenants({ status: "suspended", search: "Retail Makmur" });
    expect(suspended.some((row) => row.id === tenant.id)).toBe(true);

    const actions = await withAdmin(async (q) => {
      const { rows } = await q<{ action: string }>(
        "select action from platform_audit_log where admin_id = $1 and target = $2 order by created_at",
        [adminId, tenant.id],
      );
      return rows.map((row) => row.action);
    });

    expect(actions).toEqual(["tenant.create", "tenant.suspended"]);
  });

  it("returns 404 for missing tenant get and status update", async () => {
    const adminId = await createPlatformAdmin();
    const missingTenantId = crypto.randomUUID();

    await expect(getTenant(missingTenantId)).rejects.toMatchObject<AppError>({ status: 404, code: "not_found" });
    await expect(setTenantStatus(missingTenantId, "active", adminId)).rejects.toMatchObject<AppError>({
      status: 404,
      code: "not_found",
    });
  });
});
