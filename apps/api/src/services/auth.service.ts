import type { JwtPayload, Role } from "@app/shared";
import { randomUUID } from "node:crypto";

import { withAdmin } from "../db/withTenant";
import { AppError } from "../lib/errors";
import { signAccess, signRefresh, verifyRefresh } from "../lib/jwt";
import { verifyPassword } from "../lib/password";
import { redis } from "../lib/redis";
import { isRefreshValid, revokeRefresh, saveRefresh } from "../lib/refreshStore";
import { sendMfaEmail } from "./email.service";
import { decryptStoredSecret, issueEmailOtp, verifyEmailOtp, verifyTotp } from "./mfa.service";

const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 1_209_600;
const MFA_CHALLENGE_TTL_SECONDS = 300;

type TenantUserLogin = {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
  status: "active" | "suspended";
  tenant_status: "active" | "suspended";
  totp_secret_encrypted: string | null;
  totp_enabled: boolean | null;
};

type PlatformAdminLogin = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  totp_secret_encrypted: string | null;
  totp_enabled: boolean | null;
};

type TenantIdentity = {
  user: { id: string; tenantId: string; email: string; name: string; role: Role };
};

type AdminIdentity = {
  admin: { id: string; email: string; name: string };
};

type AuthenticatedResult = (TenantIdentity | AdminIdentity) & {
  type: "authenticated";
  accessToken: string;
  refreshToken: string;
};

type MfaMethod = "totp" | "email_otp";

type MfaRequiredResult = {
  type: "mfa_required";
  challengeToken: string;
  methods: MfaMethod[];
};

export type LoginResult = AuthenticatedResult | MfaRequiredResult;

type ChallengeRecord = {
  payload: JwtPayload;
  identity: TenantIdentity | AdminIdentity;
  email: string;
  methods: MfaMethod[];
  totpSecretEncrypted?: string;
};

const challengeKey = (token: string) => `mfa:challenge:${token}`;

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

async function authenticated(payload: JwtPayload, identity: TenantIdentity | AdminIdentity): Promise<AuthenticatedResult> {
  return { type: "authenticated", ...(await issueTokens(payload)), ...identity };
}

async function mfaRequired(record: ChallengeRecord): Promise<MfaRequiredResult> {
  const challengeToken = randomUUID();
  await redis.set(challengeKey(challengeToken), JSON.stringify(record), "EX", MFA_CHALLENGE_TTL_SECONDS);
  return { type: "mfa_required", challengeToken, methods: record.methods };
}

function parseChallenge(raw: string | null): ChallengeRecord {
  if (!raw) {
    throw new AppError(401, "invalid_mfa_challenge", "MFA challenge is invalid or expired");
  }
  try {
    return JSON.parse(raw) as ChallengeRecord;
  } catch {
    throw new AppError(401, "invalid_mfa_challenge", "MFA challenge is invalid or expired");
  }
}

function challengeMethods(totpEnabled: boolean): MfaMethod[] {
  return totpEnabled ? ["totp", "email_otp"] : ["email_otp"];
}

function hasMfaBypass(email: string): boolean {
  return (process.env.AUTH_MFA_BYPASS_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .some((value) => value === "*" || value === email.toLowerCase());
}

export async function loginTenantUser(slug: string, email: string, password: string): Promise<LoginResult> {
  const row = await withAdmin(async (q) => {
    const result = await q<TenantUserLogin>(
      `select u.id, u.tenant_id, u.email, u.password_hash, u.name, u.role, u.status,
              t.status as tenant_status,
              m.secret_encrypted as totp_secret_encrypted,
              m.enabled as totp_enabled
         from users u
         join tenants t on t.id = u.tenant_id
         left join user_mfa m on m.user_id = u.id and m.method = 'totp'
        where t.slug = $1 and u.email = $2`,
      [slug, email],
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
  const identity: TenantIdentity = {
    user: { id: row.id, tenantId: row.tenant_id, email: row.email, name: row.name, role: row.role },
  };
  const requiresMfa = row.role === "owner" || row.totp_enabled === true;
  if (requiresMfa && !hasMfaBypass(row.email)) {
    return mfaRequired({
      payload,
      identity,
      email: row.email,
      methods: challengeMethods(row.totp_enabled === true),
      totpSecretEncrypted: row.totp_secret_encrypted ?? undefined,
    });
  }

  return authenticated(payload, identity);
}

export async function loginPlatformAdmin(email: string, password: string): Promise<LoginResult> {
  const row = await withAdmin(async (q) => {
    const result = await q<PlatformAdminLogin>(
      `select a.id, a.email, a.password_hash, a.name,
              m.secret_encrypted as totp_secret_encrypted,
              m.enabled as totp_enabled
         from platform_admins a
         left join platform_admin_mfa m on m.admin_id = a.id and m.method = 'totp'
        where a.email = $1`,
      [email],
    );
    return result.rows[0];
  });

  if (!row || !(await verifyPassword(row.password_hash, password))) {
    throw new AppError(401, "invalid_credentials", "Email or password is incorrect");
  }

  const payload: JwtPayload = { sub: row.id, tenantId: null, role: "platform_admin" };
  const identity: AdminIdentity = { admin: { id: row.id, email: row.email, name: row.name } };
  if (hasMfaBypass(row.email)) {
    return authenticated(payload, identity);
  }

  return mfaRequired({
    payload,
    identity,
    email: row.email,
    methods: challengeMethods(row.totp_enabled === true),
    totpSecretEncrypted: row.totp_secret_encrypted ?? undefined,
  });
}

export async function sendMfaChallengeEmail(challengeToken: string): Promise<void> {
  const record = parseChallenge(await redis.get(challengeKey(challengeToken)));
  if (!record.methods.includes("email_otp")) {
    throw new AppError(400, "mfa_method_unavailable", "Email OTP is not available for this challenge");
  }
  const code = await issueEmailOtp(record.payload.sub);
  await sendMfaEmail(record.email, code, record.payload.sub);
}

export async function verifyMfaChallenge(
  challengeToken: string,
  method: MfaMethod,
  code: string,
): Promise<AuthenticatedResult> {
  const key = challengeKey(challengeToken);
  const record = parseChallenge(await redis.get(key));
  if (!record.methods.includes(method)) {
    throw new AppError(400, "mfa_method_unavailable", "MFA method is not available for this challenge");
  }

  const ok =
    method === "email_otp"
      ? await verifyEmailOtp(record.payload.sub, code)
      : Boolean(record.totpSecretEncrypted && verifyTotp(decryptStoredSecret(record.totpSecretEncrypted), code));

  if (!ok) {
    throw new AppError(401, "invalid_mfa", "Invalid MFA code");
  }

  await redis.del(key);
  return authenticated(record.payload, record.identity);
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
