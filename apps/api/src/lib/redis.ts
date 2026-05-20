import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl && process.env.NODE_ENV !== "test") {
  throw new Error("REDIS_URL is required outside test runs");
}

/** Per-app namespace for the shared Redis instance (ACL-enforced key prefix). */
export const appNamespace = process.env.APP_NAMESPACE ?? "app";

/**
 * Main Redis client. keyPrefix namespaces every command (refresh tokens, MFA,
 * rate limiting, plan cache) under `<namespace>:` so keys cannot collide with
 * the other apps on the shared instance.
 */
export const redis = new Redis(redisUrl ?? "redis://localhost:6379", {
  lazyConnect: !redisUrl && process.env.NODE_ENV === "test",
  maxRetriesPerRequest: null,
  keyPrefix: `${appNamespace}:`,
});

/**
 * Dedicated connection for BullMQ. BullMQ does not support ioredis keyPrefix;
 * it namespaces via its own `prefix` option instead (see queues.ts / worker.ts).
 */
export const bullConnection = new Redis(redisUrl ?? "redis://localhost:6379", {
  lazyConnect: !redisUrl && process.env.NODE_ENV === "test",
  maxRetriesPerRequest: null,
});
