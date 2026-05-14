import { categorySchema, supplierSchema, unitSchema, type JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { z } from "zod";

import { requireRole } from "../../middleware/requireRole";
import {
  createCategory,
  createSupplier,
  createUnit,
  deleteCategory,
  deleteSupplier,
  deleteUnit,
  listCategories,
  listSuppliers,
  listUnits,
  updateCategory,
  updateSupplier,
  updateUnit,
} from "./masterdata.service";

const idSchema = z.string().uuid();

export const masterdataRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

masterdataRoutes.get("/categories", async (c) => c.json(await listCategories(c.get("auth").tenantId!)));
masterdataRoutes.post("/categories", requireRole("owner", "manager"), async (c) => {
  const input = categorySchema.parse(await c.req.json());
  return c.json(await createCategory(c.get("auth").tenantId!, input), 201);
});
masterdataRoutes.patch("/categories/:id", requireRole("owner", "manager"), async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const input = categorySchema.parse(await c.req.json());
  return c.json(await updateCategory(c.get("auth").tenantId!, id, input));
});
masterdataRoutes.delete("/categories/:id", requireRole("owner", "manager"), async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  await deleteCategory(c.get("auth").tenantId!, id);
  return c.json({ ok: true });
});

masterdataRoutes.get("/units", async (c) => c.json(await listUnits(c.get("auth").tenantId!)));
masterdataRoutes.post("/units", requireRole("owner", "manager"), async (c) => {
  const input = unitSchema.parse(await c.req.json());
  return c.json(await createUnit(c.get("auth").tenantId!, input), 201);
});
masterdataRoutes.patch("/units/:id", requireRole("owner", "manager"), async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const input = unitSchema.parse(await c.req.json());
  return c.json(await updateUnit(c.get("auth").tenantId!, id, input));
});
masterdataRoutes.delete("/units/:id", requireRole("owner", "manager"), async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  await deleteUnit(c.get("auth").tenantId!, id);
  return c.json({ ok: true });
});

masterdataRoutes.get("/suppliers", async (c) => c.json(await listSuppliers(c.get("auth").tenantId!)));
masterdataRoutes.post("/suppliers", requireRole("owner", "manager"), async (c) => {
  const input = supplierSchema.parse(await c.req.json());
  return c.json(await createSupplier(c.get("auth").tenantId!, input), 201);
});
masterdataRoutes.patch("/suppliers/:id", requireRole("owner", "manager"), async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const input = supplierSchema.parse(await c.req.json());
  return c.json(await updateSupplier(c.get("auth").tenantId!, id, input));
});
masterdataRoutes.delete("/suppliers/:id", requireRole("owner", "manager"), async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  await deleteSupplier(c.get("auth").tenantId!, id);
  return c.json({ ok: true });
});
