import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { onError } from "./middleware/error.js";
import { adminRoutes } from "./routes/admin.routes";
import { authRoutes } from "./routes/auth.routes";
import { tenantRoutes } from "./routes/tenant.routes";
import "./modules/grosir";

const app = new Hono();

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
