import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { adminPool } from "./db/pool";
import { logger } from "./lib/logger";
import { redis } from "./lib/redis";
import { onError } from "./middleware/error.js";
import { adminRoutes } from "./routes/admin.routes";
import { authRoutes } from "./routes/auth.routes";
import { healthRouter } from "./routes/health";
import { tenantRoutes } from "./routes/tenant.routes";
import "./modules/grosir";

const app = new Hono();

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  "/*",
  cors({
    origin: corsOrigins,
    allowHeaders: ["content-type", "authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.onError(onError);
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
app.route("/api/v1/admin", adminRoutes);
app.route("/api/v1/t", tenantRoutes);

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.API_PORT ?? 4000);
  serve({ fetch: app.fetch, port });
  logger.info({ port }, "api listening");
}

export { app };
