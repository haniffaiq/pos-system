import { adjustmentSchema, type JwtPayload } from "@app/shared";
import { Hono } from "hono";

import { requireRole } from "../../middleware/requireRole";
import { createAdjustment, listAdjustments } from "./adjustments.service";

export const adjustmentsRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

adjustmentsRoutes.get("/", async (c) => c.json(await listAdjustments(c.get("auth").tenantId!)));

adjustmentsRoutes.post("/", requireRole("owner", "manager"), async (c) => {
  const auth = c.get("auth");
  const input = adjustmentSchema.parse(await c.req.json());
  return c.json(await createAdjustment(auth.tenantId!, auth.sub, input), 201);
});
