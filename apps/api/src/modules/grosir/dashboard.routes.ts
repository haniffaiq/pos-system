import type { JwtPayload } from "@app/shared";
import { Hono } from "hono";

import { getDashboard } from "./dashboard.service";

export const dashboardRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

dashboardRoutes.get("/", async (c) => c.json(await getDashboard(c.get("auth").tenantId!)));
