import { createHash, timingSafeEqual } from "node:crypto";

import { redis } from "./redis";

const key = (userId: string, jti: string) => `refresh:${userId}:${jti}`;

function csrfHash(csrfToken: string): string {
  return createHash("sha256").update(csrfToken).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function saveRefresh(userId: string, jti: string, ttlSeconds: number, csrfToken?: string): Promise<void> {
  const value = csrfToken ? JSON.stringify({ csrfHash: csrfHash(csrfToken) }) : "1";
  await redis.set(key(userId, jti), value, "EX", ttlSeconds);
}

export async function isRefreshValid(userId: string, jti: string): Promise<boolean> {
  return (await redis.exists(key(userId, jti))) === 1;
}

export async function revokeRefresh(userId: string, jti: string): Promise<void> {
  await redis.del(key(userId, jti));
}

export async function isCsrfBoundToRefresh(userId: string, jti: string, csrfToken: string): Promise<boolean> {
  const raw = await redis.get(key(userId, jti));
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as { csrfHash?: unknown };
    return typeof parsed.csrfHash === "string" && safeEqual(parsed.csrfHash, csrfHash(csrfToken));
  } catch {
    return false;
  }
}
