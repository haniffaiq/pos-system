import type { MiddlewareHandler } from "hono";

import { loadPlanForTenant } from "../services/quota.service";

const billableStatuses = new Set(["trialing", "active", "past_due"]);

export const billingEnabled = (): boolean => {
  const value = process.env.BILLING_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
};

export const requireActiveSubscription: MiddlewareHandler = async (c, next) => {
  if (!billingEnabled()) {
    await next();
    return;
  }

  const tenantId = c.req.param("tenantId") || c.get("auth")?.tenantId;
  if (!tenantId) {
    await next();
    return;
  }

  const plan = await loadPlanForTenant(tenantId);
  if (!plan || !billableStatuses.has(plan.status)) {
    return c.json({ code: "SUBSCRIPTION_INACTIVE" }, 402);
  }

  await next();
};
