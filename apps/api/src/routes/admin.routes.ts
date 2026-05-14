import { registerTenantSchema, updateTenantStatusSchema } from "@app/shared";
import { Hono } from "hono";
import { z } from "zod";

import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { createTenant, getTenant, listTenants, setTenantStatus } from "../services/tenant.service";

const tenantListFilterSchema = z.object({
  status: z.enum(["active", "suspended"]).optional(),
  search: z.string().trim().min(1).optional(),
});
const tenantIdSchema = z.string().uuid();

export const adminRoutes = new Hono();

adminRoutes.use("*", authMiddleware, requireRole("platform_admin"));

adminRoutes.get("/tenants", async (c) => {
  const filter = tenantListFilterSchema.parse({
    status: c.req.query("status") || undefined,
    search: c.req.query("search") || undefined,
  });
  return c.json(await listTenants(filter));
});

adminRoutes.post("/tenants", async (c) => {
  const input = registerTenantSchema.parse(await c.req.json());
  const tenant = await createTenant(input, c.get("auth").sub);
  return c.json(tenant, 201);
});

adminRoutes.get("/tenants/:id", async (c) => {
  const id = tenantIdSchema.parse(c.req.param("id"));
  return c.json(await getTenant(id));
});

adminRoutes.patch("/tenants/:id/status", async (c) => {
  const id = tenantIdSchema.parse(c.req.param("id"));
  const { status } = updateTenantStatusSchema.parse(await c.req.json());
  await setTenantStatus(id, status, c.get("auth").sub);
  return c.json({ ok: true });
});
