import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl && process.env.NODE_ENV !== "test") {
  throw new Error("REDIS_URL is required outside test runs");
}

export const redis = new Redis(redisUrl ?? "redis://localhost:6379", {
  lazyConnect: !redisUrl && process.env.NODE_ENV === "test",
  maxRetriesPerRequest: null,
});
