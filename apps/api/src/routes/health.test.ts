import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { healthRouter } from "./health";

const makeApp = (deps: Parameters<typeof healthRouter>[0]) => new Hono().route("/", healthRouter(deps));

describe("healthRouter", () => {
  it("returns liveness without checking dependencies", async () => {
    const postgresPing = vi.fn(async () => true);
    const redisPing = vi.fn(async () => true);
    const app = makeApp({ postgresPing, redisPing });

    const response = await app.request("/healthz");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(postgresPing).not.toHaveBeenCalled();
    expect(redisPing).not.toHaveBeenCalled();
  });

  it("returns ready when Postgres and Redis checks pass", async () => {
    const app = makeApp({
      postgresPing: async () => true,
      redisPing: async () => true,
    });

    const response = await app.request("/readyz");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { postgres: "ok", redis: "ok" },
    });
  });

  it("returns not ready when Postgres fails", async () => {
    const app = makeApp({
      postgresPing: async () => false,
      redisPing: async () => true,
    });

    const response = await app.request("/readyz");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      checks: { postgres: "error", redis: "ok" },
    });
  });

  it("returns not ready when Redis fails", async () => {
    const app = makeApp({
      postgresPing: async () => true,
      redisPing: async () => false,
    });

    const response = await app.request("/readyz");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      checks: { postgres: "ok", redis: "error" },
    });
  });
});
