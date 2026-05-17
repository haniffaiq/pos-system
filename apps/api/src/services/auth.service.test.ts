import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.JWT_ACCESS_SECRET = "test_access";
process.env.JWT_REFRESH_SECRET = "test_refresh";
process.env.ACCESS_TOKEN_TTL = "900";
process.env.REFRESH_TOKEN_TTL = "1209600";
process.env.MFA_KMS_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

import { adminPool } from "../db/pool";
import { encrypt } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { redis } from "../lib/redis";
import { loginPlatformAdmin, loginTenantUser, logout, refresh, verifyMfaChallenge } from "./auth.service";
import { generateCurrentTotp } from "./mfa.service";

const hasAuthInfra = Boolean(process.env.DATABASE_URL && process.env.DATABASE_ADMIN_URL && process.env.REDIS_URL);
const describeWithAuthInfra = hasAuthInfra ? describe : describe.skip;
const testNamespace = `auth-${process.pid}-${Date.now()}`;
const refreshSubjects = new Set<string>();
const challengeTokens = new Set<string>();
const totpSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

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
  let ownerEmail: string;
  let totpUserEmail: string;
  let inactiveTenantSlug: string;
  let inactiveUserEmail: string;
  let platformAdminEmail: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("secret12");
    const inactivePasswordHash = await hashPassword("disabled12");
    tenantSlug = `${testNamespace}-tenant`;
    tenantUserEmail = `${testNamespace}-user@example.test`;
    ownerEmail = `${testNamespace}-owner@example.test`;
    totpUserEmail = `${testNamespace}-totp-user@example.test`;
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
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, $3, $4, 'manager')",
      [activeTenant.rows[0]!.id, tenantUserEmail, passwordHash, "Tenant Manager"]
    );
    await adminPool.query(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, $3, $4, 'owner')",
      [activeTenant.rows[0]!.id, ownerEmail, passwordHash, "Tenant Owner"]
    );
    const totpUser = await adminPool.query<{ id: string }>(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, $3, $4, 'manager') returning id",
      [activeTenant.rows[0]!.id, totpUserEmail, passwordHash, "TOTP User"]
    );
    await adminPool.query(
      `insert into user_mfa(user_id, method, secret_encrypted, enabled, enrolled_at, verified_at)
       values ($1, 'totp', $2, true, now(), now())`,
      [totpUser.rows[0]!.id, encrypt(totpSecret)]
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
    if (challengeTokens.size > 0) await redis.del(...Array.from(challengeTokens, (token) => `mfa:challenge:${token}`));
  });

  it("logs in an active tenant user with the right password", async () => {
    const result = await loginTenantUser(tenantSlug, tenantUserEmail, "secret12");

    expect(result.type).toBe("authenticated");
    if (result.type !== "authenticated" || !("user" in result)) throw new Error("expected authenticated user");
    refreshSubjects.add(result.user.id);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user).toMatchObject({
      email: tenantUserEmail,
      name: "Tenant Manager",
      role: "manager",
    });
    expect(result.user.tenantId).toBeTruthy();
  });

  it("returns MFA_REQUIRED for TOTP-enrolled users, then issues tokens after valid TOTP", async () => {
    const owner = await loginTenantUser(tenantSlug, ownerEmail, "secret12");
    if (owner.type !== "authenticated" || !("user" in owner)) throw new Error("expected owner authenticated without MFA");
    refreshSubjects.add(owner.user.id);

    const challenged = await loginTenantUser(tenantSlug, totpUserEmail, "secret12");
    expect(challenged).toMatchObject({ type: "mfa_required", methods: ["totp", "email_otp"] });
    if (challenged.type !== "mfa_required") throw new Error("expected MFA challenge");
    challengeTokens.add(challenged.challengeToken);

    const result = await verifyMfaChallenge(challenged.challengeToken, "totp", generateCurrentTotp(totpSecret));
    if (!("user" in result)) throw new Error("expected authenticated user");
    refreshSubjects.add(result.user.id);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user).toMatchObject({ email: totpUserEmail, role: "manager" });
    await expect(verifyMfaChallenge(challenged.challengeToken, "totp", generateCurrentTotp(totpSecret))).rejects.toMatchObject({
      status: 401,
      code: "invalid_mfa_challenge",
    } satisfies Partial<AppError>);
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

  it("does not require MFA for platform admins without TOTP enrollment", async () => {
    const result = await loginPlatformAdmin(platformAdminEmail, "admin123");

    if (result.type !== "authenticated" || !("admin" in result)) throw new Error("expected authenticated admin without MFA");
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it("refresh rotates the token and logout invalidates the current refresh token", async () => {
    const login = await loginTenantUser(tenantSlug, tenantUserEmail, "secret12");
    if (login.type !== "authenticated" || !("user" in login)) throw new Error("expected authenticated user");
    refreshSubjects.add(login.user.id);
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
