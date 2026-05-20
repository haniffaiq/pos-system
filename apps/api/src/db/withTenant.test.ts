import { afterAll, describe, expect, it } from "vitest";
import { adminPool, tenantPool } from "./pool";
import { withAdmin, withTenant } from "./withTenant";

const databaseUrl = process.env.DATABASE_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("withTenant", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("sets the RLS context so a tenant only sees its own rows", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const tenantA = await withAdmin(async (q) => {
      const { rows } = await q<{ id: string }>(
        "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
        [`Tenant A ${suffix}`, `wt-a-${suffix}`]
      );
      return rows[0]!.id;
    });
    const tenantB = await withAdmin(async (q) => {
      const { rows } = await q<{ id: string }>(
        "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
        [`Tenant B ${suffix}`, `wt-b-${suffix}`]
      );
      return rows[0]!.id;
    });

    await withAdmin(async (q) => {
      await q(
        "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'UA', 'owner')",
        [tenantA, `u-a-${suffix}@example.test`]
      );
      await q(
        "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'UB', 'owner')",
        [tenantB, `u-b-${suffix}@example.test`]
      );
    });

    const rows = await withTenant(tenantA, async (q) => {
      const result = await q<{ tenant_id: string }>("select tenant_id from users order by tenant_id");
      return result.rows;
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenant_id).toBe(tenantA);
  });

  it("withAdmin sees rows across all tenants", async () => {
    const all = await withAdmin(async (q) => {
      const { rows } = await q<{ n: number }>("select count(*)::int as n from tenants");
      return rows[0]!.n;
    });

    expect(all).toBeGreaterThanOrEqual(2);
  });
});
