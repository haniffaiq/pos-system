import { Hono } from "hono";

type HealthStatus = "ok" | "error";

type HealthDeps = {
  postgresPing: () => Promise<boolean>;
  redisPing: () => Promise<boolean>;
};

const statusFor = (ok: boolean): HealthStatus => (ok ? "ok" : "error");

export const healthRouter = (deps: HealthDeps) => {
  const router = new Hono();

  router.get("/healthz", (c) => c.json({ status: "ok" }));
  router.get("/readyz", async (c) => {
    const [postgresOk, redisOk] = await Promise.all([deps.postgresPing(), deps.redisPing()]);
    const ready = postgresOk && redisOk;

    return c.json(
      {
        status: statusFor(ready),
        checks: {
          postgres: statusFor(postgresOk),
          redis: statusFor(redisOk),
        },
      },
      ready ? 200 : 503,
    );
  });

  return router;
};
