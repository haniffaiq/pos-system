import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPool, tenantPool } from "./pool";
import { withTenant } from "./withTenant";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;

const describeWithDatabase = databaseUrl && databaseAdminUrl ? describe : describe.skip;

let tenantA: string;
let tenantB: string;
let suffix: string;
let tenantAEmail: string;
let tenantBEmail: string;

describeWithDatabase("RLS isolation", () => {
  beforeAll(async () => {
    suffix = crypto.randomUUID().slice(0, 8);
    tenantAEmail = `a-${suffix}@rls.test`;
    tenantBEmail = `b-${suffix}@rls.test`;

    const a = await adminPool.query<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      [`RLS A ${suffix}`, `rls-a-${suffix}`]
    );
    const b = await adminPool.query<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      [`RLS B ${suffix}`, `rls-b-${suffix}`]
    );

    tenantA = a.rows[0]!.id;
    tenantB = b.rows[0]!.id;

    await adminPool.query(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'A', 'owner')",
      [tenantA, tenantAEmail]
    );
    await adminPool.query(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'B', 'owner')",
      [tenantB, tenantBEmail]
    );
  });

  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("tenant A cannot SELECT tenant B users", async () => {
    const rows = await withTenant(tenantA, async (q) => {
      const result = await q<{ email: string }>(
        "select email from users where email in ($1, $2) order by email",
        [tenantAEmail, tenantBEmail]
      );
      return result.rows;
    });

    expect(rows).toEqual([{ email: tenantAEmail }]);
  });

  it("tenant A cannot UPDATE tenant B users", async () => {
    const affected = await withTenant(tenantA, async (q) => {
      const result = await q(
        "update users set name = 'HACKED' where email in ($1, $2)",
        [tenantAEmail, tenantBEmail]
      );
      return result.rowCount;
    });

    expect(affected).toBe(1);

    const bUser = await adminPool.query<{ name: string }>(
      "select name from users where tenant_id = $1 and email = $2",
      [tenantB, tenantBEmail]
    );
    expect(bUser.rows[0]!.name).toBe("B");
  });

  it("tenant A cannot DELETE tenant B users", async () => {
    const affected = await withTenant(tenantA, async (q) => {
      const result = await q("delete from users where email = $1", [tenantBEmail]);
      return result.rowCount;
    });

    expect(affected).toBe(0);

    const bUser = await adminPool.query<{ n: number }>(
      "select count(*)::int as n from users where tenant_id = $1 and email = $2",
      [tenantB, tenantBEmail]
    );
    expect(bUser.rows[0]!.n).toBe(1);
  });

  it("tenant A cannot INSERT a row for tenant B", async () => {
    await expect(
      withTenant(tenantA, async (q) =>
        q(
          "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'E', 'owner')",
          [tenantB, `evil-${suffix}@rls.test`]
        )
      )
    ).rejects.toThrow();
  });
});
