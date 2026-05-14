import { afterAll, describe, expect, it } from "vitest";
import { adminPool, tenantPool } from "./pool";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;

const describeWithDatabase = databaseUrl && databaseAdminUrl ? describe : describe.skip;

describeWithDatabase("db pools", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("connects with the tenant role and runs a query", async () => {
    const { rows } = await tenantPool.query<{ ok: number }>("select 1 as ok");

    expect(rows[0]?.ok).toBe(1);
  });

  it("connects with the admin role", async () => {
    const { rows } = await adminPool.query<{ ok: number }>("select 1 as ok");

    expect(rows[0]?.ok).toBe(1);
  });
});
