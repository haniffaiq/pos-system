import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.JWT_ACCESS_SECRET = "test_access";
process.env.JWT_REFRESH_SECRET = "test_refresh";
process.env.ACCESS_TOKEN_TTL = "900";
process.env.REFRESH_TOKEN_TTL = "1209600";

import { adminPool } from "../db/pool";
import { AppError } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { redis } from "../lib/redis";
import { loginPlatformAdmin, loginTenantUser, logout, refresh } from "./auth.service";

const hasAuthInfra = Boolean(process.env.DATABASE_URL && process.env.DATABASE_ADMIN_URL && process.env.REDIS_URL);
const describeWithAuthInfra = hasAuthInfra ? describe : describe.skip;
const testNamespace = `auth-${process.pid}-${Date.now()}`;
const refreshSubjects = new Set<string>();

async function cleanupRefreshKeys(): Promise<void> {
  for (const subject of Array.from(refreshSubjects)) {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `refresh:${subject}:*`, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  }
}

describeWithAuthInfra("auth.service", () => {
  let tenantSlug: string;
  let tenantUserEmail: string;
  let inactiveTenantSlug: string;
  let inactiveUserEmail: string;
  let platformAdminEmail: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("secret12");
    const inactivePasswordHash = await hashPassword("disabled12");
    tenantSlug = `${testNamespace}-tenant`;
    tenantUserEmail = `${testNamespace}-user@example.test`;
    inactiveTenantSlug = `${testNamespace}-inactive-tenant`;
    inactiveUserEmail = `${testNamespace}-inactive-user@example.test`;
    platformAdminEmail = `${testNamespace}-admin@example.test`;

    const activeTenant = await adminPool.query<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      [`${testNamespace} Tenant`, tenantSlug]
    );
    const inactiveTenant = await adminPool.query<{ id: string }>(
      "insert into tenants(name, slug, sector, status) values ($1, $2, 'grosir', 'suspended') returning id",
      [`${testNamespace} Suspended Tenant`, inactiveTenantSlug]
    );

    await adminPool.query(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, $3, $4, 'owner')",
      [activeTenant.rows[0]!.id, tenantUserEmail, passwordHash, "Tenant Owner"]
    );
    await adminPool.query(
      "insert into users(tenant_id, email, password_hash, name, role, status) values ($1, $2, $3, $4, 'cashier', 'suspended')",
      [activeTenant.rows[0]!.id, inactiveUserEmail, inactivePasswordHash, "Inactive User"]
    );
    await adminPool.query(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, $3, $4, 'manager')",
      [inactiveTenant.rows[0]!.id, `${testNamespace}-tenant-disabled-user@example.test`, inactivePasswordHash, "Tenant Disabled User"]
    );
    await adminPool.query(
      "insert into platform_admins(email, password_hash, name) values ($1, $2, $3)",
      [platformAdminEmail, await hashPassword("admin123"), "Platform Admin"]
    );
  });

  afterAll(async () => {
    await cleanupRefreshKeys();
  });

  it("logs in an active tenant user with the right password", async () => {
    const result = await loginTenantUser(tenantSlug, tenantUserEmail, "secret12");

    refreshSubjects.add(result.user.id);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user).toMatchObject({
      email: tenantUserEmail,
      name: "Tenant Owner",
      role: "owner",
    });
    expect(result.user.tenantId).toBeTruthy();
  });

  it("rejects wrong passwords and disabled tenant users", async () => {
    await expect(loginTenantUser(tenantSlug, tenantUserEmail, "wrong")).rejects.toMatchObject({
      status: 401,
      code: "invalid_credentials",
    } satisfies Partial<AppError>);

    await expect(loginTenantUser(tenantSlug, inactiveUserEmail, "disabled12")).rejects.toMatchObject({
      status: 403,
      code: "account_disabled",
    } satisfies Partial<AppError>);
  });

  it("rejects users under suspended tenants", async () => {
    await expect(
      loginTenantUser(inactiveTenantSlug, `${testNamespace}-tenant-disabled-user@example.test`, "disabled12")
    ).rejects.toMatchObject({
      status: 403,
      code: "account_disabled",
    } satisfies Partial<AppError>);
  });

  it("logs in a platform admin", async () => {
    const result = await loginPlatformAdmin(platformAdminEmail, "admin123");

    refreshSubjects.add(result.admin.id);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.admin).toMatchObject({ email: platformAdminEmail, name: "Platform Admin" });
  });

  it("refresh rotates the token and logout invalidates the current refresh token", async () => {
    const login = await loginPlatformAdmin(platformAdminEmail, "admin123");
    refreshSubjects.add(login.admin.id);
    const rotated = await refresh(login.refreshToken);

    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    await expect(refresh(login.refreshToken)).rejects.toMatchObject({
      status: 401,
      code: "invalid_refresh",
    } satisfies Partial<AppError>);

    await logout(rotated.refreshToken);
    await expect(refresh(rotated.refreshToken)).rejects.toMatchObject({
      status: 401,
      code: "invalid_refresh",
    } satisfies Partial<AppError>);
  });
});
