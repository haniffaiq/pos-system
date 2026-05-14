import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { onError } from "./middleware/error";

const app = new Hono();

app.onError(onError);
app.get("/health", (c) => c.json({ ok: true }));

// Routers mounted in later tasks:
// app.route("/api/v1/auth", authRoutes);
// app.route("/api/v1/admin", adminRoutes);
// app.route("/api/v1/t", tenantRoutes);

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.API_PORT ?? 4000);
  serve({ fetch: app.fetch, port });
  console.log(`api listening on ${port}`);
}

export { app };
