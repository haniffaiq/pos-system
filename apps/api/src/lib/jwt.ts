import type { JwtPayload } from "@app/shared";
import { jwtVerify, SignJWT } from "jose";
import { randomUUID } from "node:crypto";

const TOKEN_TYPE_CLAIM = "typ";
const ACCESS_TOKEN_TYPE = "access";
const REFRESH_TOKEN_TYPE = "refresh";

const enc = (secret: string) => new TextEncoder().encode(secret);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const accessSecret = () => enc(requireEnv("JWT_ACCESS_SECRET"));
const refreshSecret = () => enc(requireEnv("JWT_REFRESH_SECRET"));

function accessTokenTtl(): string {
  return `${requireEnv("ACCESS_TOKEN_TTL")}s`;
}

function refreshTokenTtl(): string {
  return `${requireEnv("REFRESH_TOKEN_TTL")}s`;
}

export async function signAccess(p: JwtPayload): Promise<string> {
  return new SignJWT({
    [TOKEN_TYPE_CLAIM]: ACCESS_TOKEN_TYPE,
    tenantId: p.tenantId,
    role: p.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(accessTokenTtl())
    .sign(accessSecret());
}

export async function signRefresh(p: JwtPayload): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  const token = await new SignJWT({
    [TOKEN_TYPE_CLAIM]: REFRESH_TOKEN_TYPE,
    tenantId: p.tenantId,
    role: p.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(refreshTokenTtl())
    .sign(refreshSecret());

  return { token, jti };
}

export async function verifyAccess(token: string): Promise<JwtPayload> {
  try {
    const { payload } = await jwtVerify(token, accessSecret());
    if (payload[TOKEN_TYPE_CLAIM] !== ACCESS_TOKEN_TYPE) {
      throw new Error("invalid access token type");
    }

    return {
      sub: requireSubject(payload.sub, "access"),
      tenantId: readTenantId(payload.tenantId),
      role: readRole(payload.role),
    };
  } catch (error) {
    throw wrapJwtError(error, "access");
  }
}

export async function verifyRefresh(token: string): Promise<JwtPayload & { jti: string; exp: number }> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret());
    if (payload[TOKEN_TYPE_CLAIM] !== REFRESH_TOKEN_TYPE) {
      throw new Error("invalid refresh token type");
    }
    if (typeof payload.jti !== "string" || payload.jti.length === 0) {
      throw new Error("invalid refresh token jti");
    }

    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      throw new Error("invalid refresh token expiration");
    }

    return {
      sub: requireSubject(payload.sub, "refresh"),
      tenantId: readTenantId(payload.tenantId),
      role: readRole(payload.role),
      jti: payload.jti,
      exp: payload.exp,
    };
  } catch (error) {
    throw wrapJwtError(error, "refresh");
  }
}

function requireSubject(sub: unknown, type: "access" | "refresh"): string {
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error(`invalid ${type} token subject`);
  }
  return sub;
}

function readTenantId(tenantId: unknown): string | null {
  if (tenantId === null || tenantId === undefined) {
    return null;
  }
  if (typeof tenantId !== "string") {
    throw new Error("invalid token tenantId");
  }
  return tenantId;
}

function readRole(role: unknown): JwtPayload["role"] {
  if (role !== "owner" && role !== "manager" && role !== "cashier" && role !== "platform_admin") {
    throw new Error("invalid token role");
  }
  return role;
}

function wrapJwtError(error: unknown, type: "access" | "refresh"): Error {
  if (error instanceof Error && error.message.includes(`${type} token`)) {
    return error;
  }
  const message = error instanceof Error ? error.message : "unknown verification error";
  return new Error(`invalid ${type} token: ${message}`);
}
