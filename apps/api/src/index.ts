import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { adminPool } from "./db/pool";
import { logger } from "./lib/logger";
import { redis } from "./lib/redis";
import { initSentry } from "./lib/sentry.js";
import { onError } from "./middleware/error.js";
import { metricsMiddleware, metricsRoute } from "./middleware/metrics";
import { requestLogger } from "./middleware/requestLogger";
import { adminRoutes } from "./routes/admin.routes";
import { authRoutes } from "./routes/auth.routes";
import { billingRoutes } from "./routes/billing.routes";
import { billingWebhookRouter } from "./routes/billing-webhook";
import { healthRouter } from "./routes/health";
import { mfaRouter } from "./routes/mfa";
import { signupRoutes } from "./routes/signup";
import { tenantRoutes } from "./routes/tenant.routes";
import "./modules/grosir";

initSentry();

const app = new Hono();

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  "/*",
  cors({
    origin: corsOrigins,
    allowHeaders: ["content-type", "authorization", "x-csrf-token"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.onError(onError);
app.use("*", requestLogger);
app.use("*", metricsMiddleware);
app.route("/", metricsRoute);
app.get("/health", (c) => c.json({ ok: true }));
app.route(
  "/",
  healthRouter({
    postgresPing: async () =>
      adminPool.query("select 1 as healthcheck").then(
        () => true,
        () => false,
      ),
    redisPing: async () =>
      redis.ping().then(
        () => true,
        () => false,
      ),
  }),
);

app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/auth/mfa", mfaRouter);
app.route("/api/v1/signup", signupRoutes);
app.route("/api/v1/admin", adminRoutes);
app.route("/api/v1/billing", billingWebhookRouter);
app.route("/api/v1/billing", billingRoutes);
app.route("/api/v1/t", tenantRoutes);

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.API_PORT ?? 4000);
  serve({ fetch: app.fetch, port });
  logger.info({ port }, "api listening");
}

export { app };
