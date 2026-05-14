import type { JwtPayload, Role } from "@app/shared";

import { withAdmin } from "../db/withTenant";
import { AppError } from "../lib/errors";
import { signAccess, signRefresh, verifyRefresh } from "../lib/jwt";
import { verifyPassword } from "../lib/password";
import { isRefreshValid, revokeRefresh, saveRefresh } from "../lib/refreshStore";

const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 1_209_600;

type TenantUserLogin = {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
  status: "active" | "suspended";
  tenant_status: "active" | "suspended";
};

type PlatformAdminLogin = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
};

function refreshTtlSeconds(): number {
  const configured = Number(process.env.REFRESH_TOKEN_TTL ?? DEFAULT_REFRESH_TOKEN_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFRESH_TOKEN_TTL_SECONDS;
}

async function issueTokens(payload: JwtPayload): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await signAccess(payload);
  const { token: refreshToken, jti } = await signRefresh(payload);
  await saveRefresh(payload.sub, jti, refreshTtlSeconds());

  return { accessToken, refreshToken };
}

export async function loginTenantUser(slug: string, email: string, password: string) {
  const row = await withAdmin(async (q) => {
    const result = await q<TenantUserLogin>(
      `select u.id, u.tenant_id, u.email, u.password_hash, u.name, u.role, u.status,
              t.status as tenant_status
         from users u
         join tenants t on t.id = u.tenant_id
        where t.slug = $1 and u.email = $2`,
      [slug, email]
    );
    return result.rows[0];
  });

  if (!row || !(await verifyPassword(row.password_hash, password))) {
    throw new AppError(401, "invalid_credentials", "Email or password is incorrect");
  }
  if (row.status !== "active" || row.tenant_status !== "active") {
    throw new AppError(403, "account_disabled", "This account or tenant is suspended");
  }

  const payload: JwtPayload = { sub: row.id, tenantId: row.tenant_id, role: row.role };
  const tokens = await issueTokens(payload);

  return {
    ...tokens,
    user: {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      name: row.name,
      role: row.role,
    },
  };
}

export async function loginPlatformAdmin(email: string, password: string) {
  const row = await withAdmin(async (q) => {
    const result = await q<PlatformAdminLogin>(
      "select id, email, password_hash, name from platform_admins where email = $1",
      [email]
    );
    return result.rows[0];
  });

  if (!row || !(await verifyPassword(row.password_hash, password))) {
    throw new AppError(401, "invalid_credentials", "Email or password is incorrect");
  }

  const payload: JwtPayload = { sub: row.id, tenantId: null, role: "platform_admin" };
  const tokens = await issueTokens(payload);

  return {
    ...tokens,
    admin: {
      id: row.id,
      email: row.email,
      name: row.name,
    },
  };
}

export async function refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  let decoded: JwtPayload & { jti: string };
  try {
    decoded = await verifyRefresh(refreshToken);
  } catch {
    throw new AppError(401, "invalid_refresh", "Refresh token is invalid or expired");
  }

  if (!(await isRefreshValid(decoded.sub, decoded.jti))) {
    throw new AppError(401, "invalid_refresh", "Refresh token has been revoked");
  }

  await revokeRefresh(decoded.sub, decoded.jti);
  return issueTokens({ sub: decoded.sub, tenantId: decoded.tenantId, role: decoded.role });
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    const decoded = await verifyRefresh(refreshToken);
    await revokeRefresh(decoded.sub, decoded.jti);
  } catch {
    // Invalid/expired refresh tokens are already logged out from the server perspective.
  }
}
