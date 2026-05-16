import { RateLimiterRedis, type RateLimiterRes } from "rate-limiter-flexible";
import type { MiddlewareHandler } from "hono";

import { redis } from "../lib/redis";

type RedisLike = ConstructorParameters<typeof RateLimiterRedis>[0]["storeClient"];

type RateLimitOptions = {
  points: number;
  duration: number;
  keyPrefix: string;
};

type ConsumableRateLimiter = {
  consume(key: string): Promise<RateLimiterRes>;
};

const RATE_LIMITED_BODY = { code: "RATE_LIMITED", message: "Too many requests" };

export function makeRateLimit(storeClient: RedisLike, opts: RateLimitOptions): RateLimiterRedis {
  return new RateLimiterRedis({
    storeClient,
    keyPrefix: opts.keyPrefix,
    points: opts.points,
    duration: opts.duration,
  });
}

export function rateLimitEnabled(): boolean {
  if (process.env.RATE_LIMIT_ENABLED === "false" || process.env.RATE_LIMIT_DISABLED === "true") {
    return false;
  }

  return Boolean(process.env.REDIS_URL) || process.env.NODE_ENV !== "test";
}

export function requestIpKey(c: Pick<Parameters<MiddlewareHandler>[0], "req">): string {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || c.req.header("x-real-ip") || "unknown-ip";
}

function retryAfterSeconds(error: unknown): string {
  const msBeforeNext = typeof error === "object" && error !== null && "msBeforeNext" in error
    ? Number((error as RateLimiterRes).msBeforeNext)
    : 60_000;
  return String(Math.max(1, Math.ceil((Number.isFinite(msBeforeNext) ? msBeforeNext : 60_000) / 1000)));
}

export function rateLimitMiddleware(
  limiter: ConsumableRateLimiter,
  keyFn: (c: Parameters<MiddlewareHandler>[0]) => string,
): MiddlewareHandler {
  return async (c, next) => {
    if (!rateLimitEnabled()) {
      await next();
      return;
    }

    try {
      await limiter.consume(keyFn(c));
    } catch (error) {
      c.header("Retry-After", retryAfterSeconds(error));
      return c.json(RATE_LIMITED_BODY, 429);
    }

    await next();
  };
}

export function rateLimitByJsonBodyField(
  limiter: ConsumableRateLimiter,
  field: string,
  normalize: (value: string) => string = (value) => value.trim().toLowerCase(),
): MiddlewareHandler {
  return async (c, next) => {
    if (!rateLimitEnabled()) {
      await next();
      return;
    }

    let key = "missing";
    try {
      const body = await c.req.json();
      const value = body?.[field];
      if (typeof value === "string" && value.trim()) {
        key = normalize(value);
      }
    } catch {
      key = "invalid-json";
    }

    try {
      await limiter.consume(key);
    } catch (error) {
      c.header("Retry-After", retryAfterSeconds(error));
      return c.json(RATE_LIMITED_BODY, 429);
    }

    await next();
  };
}

export const loginIpRateLimit = makeRateLimit(redis, { points: 5, duration: 60, keyPrefix: "rl:login:ip" });
export const loginEmailRateLimit = makeRateLimit(redis, { points: 10, duration: 60, keyPrefix: "rl:login:email" });
export const refreshIpRateLimit = makeRateLimit(redis, { points: 20, duration: 60, keyPrefix: "rl:refresh:ip" });
export const signupIpRateLimit = makeRateLimit(redis, { points: 3, duration: 60 * 60, keyPrefix: "rl:signup:ip" });
export const authSensitiveRateLimit = makeRateLimit(redis, {
  points: 120,
  duration: 60,
  keyPrefix: "rl:auth-sensitive",
});
