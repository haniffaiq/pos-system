import { Hono } from "hono";
import Redis from "ioredis-mock";
import { beforeEach, describe, expect, it } from "vitest";

import { makeRateLimit, rateLimitMiddleware, requestIpKey, rateLimitByJsonBodyField } from "./rateLimit";

describe("rateLimit", () => {
  let redis: Redis;

  beforeEach(async () => {
    process.env.REDIS_URL = "redis://unit-test";
    redis = new Redis();
    await redis.flushall();
  });

  it("allows requests under the token bucket limit and blocks over-limit keys", async () => {
    const limiter = makeRateLimit(redis, { points: 2, duration: 60, keyPrefix: "test" });

    await expect(limiter.consume("k1")).resolves.toBeTruthy();
    await expect(limiter.consume("k1")).resolves.toBeTruthy();
    await expect(limiter.consume("k1")).rejects.toMatchObject({ remainingPoints: 0 });
    await expect(limiter.consume("k2")).resolves.toBeTruthy();
  });

  it("returns 429 and Retry-After from middleware when a key is over limit", async () => {
    const limiter = makeRateLimit(redis, { points: 1, duration: 60, keyPrefix: "middleware" });
    const app = new Hono();
    app.use("/*", rateLimitMiddleware(limiter, () => "same-key"));
    app.get("/limited", (c) => c.json({ ok: true }));

    expect((await app.request("/limited")).status).toBe(200);
    const blocked = await app.request("/limited");

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(await blocked.json()).toEqual({ code: "RATE_LIMITED", message: "Too many requests" });
  });

  it("uses x-forwarded-for first IP and falls back gracefully when no client IP exists", async () => {
    expect(requestIpKey({ req: { header: (name: string) => (name === "x-forwarded-for" ? "203.0.113.7, 10.0.0.1" : undefined) } })).toBe(
      "203.0.113.7",
    );
    expect(requestIpKey({ req: { header: () => undefined } })).toBe("unknown-ip");
  });

  it("rate limits by a JSON body field without consuming the body for downstream handlers", async () => {
    const limiter = makeRateLimit(redis, { points: 1, duration: 60, keyPrefix: "email" });
    const app = new Hono();
    app.post("/login", rateLimitByJsonBodyField(limiter, "email"), async (c) => {
      const body = await c.req.json();
      return c.json({ email: body.email });
    });

    const first = await app.request("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "USER@Example.test" }),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ email: "USER@Example.test" });

    const blocked = await app.request("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.test" }),
    });
    expect(blocked.status).toBe(429);
  });
});
