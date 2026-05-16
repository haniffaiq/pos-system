import type { Sector } from "@app/shared";
import { Hono } from "hono";

import { withAdmin } from "../db/withTenant";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { onError } from "../middleware/error";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { getModule } from "../modules/registry";

declare module "hono" {
  interface ContextVariableMap {
    sector: Sector;
    tenantSlug: string;
  }
}

export const tenantRoutes = new Hono();

tenantRoutes.use("/:tenantId/*", authMiddleware, async (c, next) => {
  const auth = c.get("auth");
  const pathTenantId = c.req.param("tenantId");

  if (auth.role === "platform_admin" || auth.tenantId !== pathTenantId) {
    throw new AppError(403, "forbidden", "Token does not belong to this tenant");
  }

  const tenant = await withAdmin(async (q) => {
    const result = await q<{ sector: Sector; status: string; slug: string }>("select sector, status, slug from tenants where id = $1", [
      pathTenantId,
    ]);
    return result.rows[0];
  });

  if (!tenant) {
    throw new AppError(404, "not_found", "Tenant not found");
  }
  if (tenant.status !== "active") {
    throw new AppError(403, "tenant_suspended", "Tenant is suspended");
  }

  c.set("sector", tenant.sector);
  c.set("tenantSlug", tenant.slug);
  return requireActiveSubscription(c, next);
});

tenantRoutes.get("/:tenantId/me", (c) => {
  const auth = c.get("auth");
  return c.json({
    userId: auth.sub,
    tenantId: auth.tenantId,
    tenantSlug: c.get("tenantSlug"),
    role: auth.role,
    sector: c.get("sector"),
  });
});

tenantRoutes.all("/:tenantId/m/*", async (c) => {
  const mod = getModule(c.get("sector"));
  if (!mod) {
    return c.json(
      {
        error: {
          code: "module_coming_soon",
          message: "This sector module is not available yet",
        },
      },
      404,
    );
  }

  const url = new URL(c.req.url);
  const modulePrefix = `/api/v1/t/${c.req.param("tenantId")}/m`;
  url.pathname = url.pathname.startsWith(modulePrefix)
    ? (url.pathname.slice(modulePrefix.length) || "/")
    : url.pathname;

  try {
    return await mod.router.fetch(new Request(url, c.req.raw), c.env);
  } catch (error) {
    return onError(error as Error, c);
  }
});
