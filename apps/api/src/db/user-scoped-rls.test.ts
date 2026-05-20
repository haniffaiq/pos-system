import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPool, tenantPool } from "./pool";
import { withTenant } from "./withTenant";

const databaseUrl = process.env.DATABASE_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

let tenantId: string;
let userAId: string;
let userBId: string;
let suffix: string;

describeWithDatabase("user-scoped RLS context", () => {
  beforeAll(async () => {
    suffix = crypto.randomUUID().slice(0, 8);

    const tenant = await adminPool.query<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      [`User RLS ${suffix}`, `user-rls-${suffix}`]
    );
    tenantId = tenant.rows[0]!.id;

    const userA = await adminPool.query<{ id: string }>(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'User A', 'owner') returning id",
      [tenantId, `user-a-${suffix}@rls.test`]
    );
    const userB = await adminPool.query<{ id: string }>(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'User B', 'cashier') returning id",
      [tenantId, `user-b-${suffix}@rls.test`]
    );
    userAId = userA.rows[0]!.id;
    userBId = userB.rows[0]!.id;

    await adminPool.query(
      "insert into user_mfa(user_id, method, enabled) values ($1, 'email_otp', true), ($2, 'email_otp', true)",
      [userAId, userBId]
    );
  });

  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("shows only the current user's MFA rows inside a user-scoped tenant transaction", async () => {
    const rows = await withTenant(tenantId, { userId: userAId }, async (q) => {
      const result = await q<{ user_id: string }>("select user_id from user_mfa order by user_id");
      return result.rows;
    });

    expect(rows).toEqual([{ user_id: userAId }]);
  });

  it("hides user-scoped MFA rows when no current user is set", async () => {
    const rows = await withTenant(tenantId, async (q) => {
      const result = await q<{ user_id: string }>("select user_id from user_mfa order by user_id");
      return result.rows;
    });

    expect(rows).toEqual([]);
  });

  it("prevents inserting MFA rows for a different current user", async () => {
    await expect(
      withTenant(tenantId, { userId: userAId }, (q) =>
        q("insert into user_mfa(user_id, method, enabled) values ($1, 'totp', true)", [userBId])
      )
    ).rejects.toThrow();
  });
});
