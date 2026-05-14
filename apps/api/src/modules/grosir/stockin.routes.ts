import { stockInSchema, type JwtPayload } from "@app/shared";
import { Hono } from "hono";

import { requireRole } from "../../middleware/requireRole";
import { createStockIn, listStockIn } from "./stockin.service";

export const stockInRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

stockInRoutes.get("/", async (c) => c.json(await listStockIn(c.get("auth").tenantId!)));

stockInRoutes.post("/", requireRole("owner", "manager"), async (c) => {
  const auth = c.get("auth");
  const input = stockInSchema.parse(await c.req.json());
  return c.json(await createStockIn(auth.tenantId!, auth.sub, input), 201);
});
