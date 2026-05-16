import type { JwtPayload } from "@app/shared";
import type { MiddlewareHandler } from "hono";

import { AppError } from "../lib/errors";
import { countResource, currentMonthlyUsage, isOverQuota, loadPlanForTenant } from "../services/quota.service";

export type QuotaMetric = "users" | "skus" | "tx_per_month" | "exports" | "outlets";

type UsageResolver = (tenantId: string) => Promise<number>;

const usageResolvers: Record<QuotaMetric, UsageResolver> = {
  users: (tenantId) => countResource(tenantId, "users"),
  skus: (tenantId) => countResource(tenantId, "products"),
  tx_per_month: (tenantId) => currentMonthlyUsage(tenantId, "tx_count"),
  exports: (tenantId) => currentMonthlyUsage(tenantId, "export_count"),
  outlets: (tenantId) => countResource(tenantId, "outlets"),
};

const numericLimit = (value: unknown): number => {
  const limit = Number(value ?? 0);
  return Number.isFinite(limit) ? limit : 0;
};

const upgradeUrl = (tenantId: string): string => {
  const publicAppUrl = process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  return `${publicAppUrl}/t/${tenantId}/billing`;
};

export const enforceQuota = (metric: QuotaMetric): MiddlewareHandler<{ Variables: { auth: JwtPayload } }> => {
  return async (c, next) => {
    const tenantId = c.get("auth")?.tenantId;
    if (!tenantId) {
      throw new AppError(401, "unauthorized", "Missing tenant context");
    }

    const plan = await loadPlanForTenant(tenantId);
    if (!plan) {
      throw new AppError(402, "SUBSCRIPTION_INACTIVE", "Subscription is inactive");
    }

    const limit = numericLimit(plan.quota[metric]);
    const current = await usageResolvers[metric](tenantId);

    if (isOverQuota(limit, current)) {
      throw new AppError(403, "QUOTA_EXCEEDED", "Quota exceeded", {
        metric,
        limit,
        current,
        upgrade_url: upgradeUrl(tenantId),
      });
    }

    await next();
  };
};
