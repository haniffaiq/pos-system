import { Hono } from "hono";
import { z } from "zod";

import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { createBillingCheckout, getBillingSummary } from "../services/billing.service";

const checkoutSchema = z.object({ plan: z.enum(["pro", "business"]) });

export const billingRoutes = new Hono();

billingRoutes.use("*", authMiddleware, async (c, next) => {
  const auth = c.get("auth");
  if (auth.role === "platform_admin" || !auth.tenantId) {
    throw new AppError(403, "forbidden", "Billing is available for tenant users only");
  }
  await next();
});

billingRoutes.get("/summary", async (c) => c.json(await getBillingSummary(c.get("auth").tenantId!)));

billingRoutes.post("/checkout", async (c) => {
  const { plan } = checkoutSchema.parse(await c.req.json());
  const auth = c.get("auth");
  return c.json(await createBillingCheckout({ tenantId: auth.tenantId!, userId: auth.sub, planCode: plan }));
});
