import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { onError } from "./middleware/error.js";
import { adminRoutes } from "./routes/admin.routes";
import { authRoutes } from "./routes/auth.routes";
import { tenantRoutes } from "./routes/tenant.routes";
import "./modules/grosir";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    allowHeaders: ["content-type", "authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.onError(onError);
app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/admin", adminRoutes);
app.route("/api/v1/t", tenantRoutes);

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.API_PORT ?? 4000);
  serve({ fetch: app.fetch, port });
  console.log(`api listening on ${port}`);
}

export { app };
