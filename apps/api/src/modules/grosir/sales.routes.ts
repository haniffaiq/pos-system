import { saleSchema, type JwtPayload } from "@app/shared";
import { Hono } from "hono";

import { enforceQuota } from "../../middleware/enforceQuota";
import { incrementUsage } from "../../services/quota.service";
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

salesRoutes.post("/", enforceQuota("tx_per_month"), async (c) => {
  const auth = c.get("auth");
  const input = saleSchema.parse(await c.req.json());
  const sale = await createSale(auth.tenantId!, auth.sub, input);
  await incrementUsage(auth.tenantId!, "tx_count");
  return c.json(sale, 201);
});
