import { redis } from "./redis";

const key = (userId: string, jti: string) => `refresh:${userId}:${jti}`;

export async function saveRefresh(userId: string, jti: string, ttlSeconds: number): Promise<void> {
  await redis.set(key(userId, jti), "1", "EX", ttlSeconds);
}

export async function isRefreshValid(userId: string, jti: string): Promise<boolean> {
  return (await redis.exists(key(userId, jti))) === 1;
}

export async function revokeRefresh(userId: string, jti: string): Promise<void> {
  await redis.del(key(userId, jti));
}
