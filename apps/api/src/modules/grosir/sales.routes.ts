import { saleSchema, type JwtPayload } from "@app/shared";
import { Hono } from "hono";

import { createSale, listSales } from "./sales.service";

export const salesRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

salesRoutes.get("/", async (c) =>
  c.json(
    await listSales(c.get("auth").tenantId!, {
      from: c.req.query("from") || undefined,
      to: c.req.query("to") || undefined,
    }),
  ),
);

salesRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const input = saleSchema.parse(await c.req.json());
  return c.json(await createSale(auth.tenantId!, auth.sub, input), 201);
});
