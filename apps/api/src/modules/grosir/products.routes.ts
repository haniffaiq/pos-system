import { productSchema, type JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { z } from "zod";

import { requireRole } from "../../middleware/requireRole";
import { createProduct, getProduct, listProducts, setProductActive, updateProduct } from "./products.service";

const idSchema = z.string().uuid();

export const productsRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

productsRoutes.get("/", async (c) =>
  c.json(
    await listProducts(c.get("auth").tenantId!, {
      search: c.req.query("search") || undefined,
      activeOnly: c.req.query("activeOnly") === "true",
    }),
  ),
);

productsRoutes.get("/:id", async (c) => c.json(await getProduct(c.get("auth").tenantId!, idSchema.parse(c.req.param("id")))));

productsRoutes.post("/", requireRole("owner", "manager"), async (c) => {
  const input = productSchema.parse(await c.req.json());
  return c.json(await createProduct(c.get("auth").tenantId!, input), 201);
});

productsRoutes.put("/:id", requireRole("owner", "manager"), async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const input = productSchema.parse(await c.req.json());
  return c.json(await updateProduct(c.get("auth").tenantId!, id, input));
});

productsRoutes.patch("/:id/active", requireRole("owner", "manager"), async (c) => {
  const id = idSchema.parse(c.req.param("id"));
  const { isActive } = z.object({ isActive: z.boolean() }).parse(await c.req.json());
  await setProductActive(c.get("auth").tenantId!, id, isActive);
  return c.json({ ok: true });
});
