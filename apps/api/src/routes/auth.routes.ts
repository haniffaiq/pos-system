import { loginSchema } from "@app/shared";
import { Hono } from "hono";
import { z } from "zod";

import {
  loginEmailRateLimit,
  loginIpRateLimit,
  rateLimitByJsonBodyField,
  rateLimitMiddleware,
  refreshIpRateLimit,
  requestIpKey,
} from "../middleware/rateLimit";
import { loginPlatformAdmin, loginTenantUser, logout, refresh } from "../services/auth.service";

const tenantLoginSchema = loginSchema.extend({ slug: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const loginIpLimiter = rateLimitMiddleware(loginIpRateLimit, requestIpKey);
const loginEmailLimiter = rateLimitByJsonBodyField(loginEmailRateLimit, "email");
const refreshIpLimiter = rateLimitMiddleware(refreshIpRateLimit, requestIpKey);

export const authRoutes = new Hono();

authRoutes.post("/tenant-login", loginIpLimiter, loginEmailLimiter, async (c) => {
  const { slug, email, password } = tenantLoginSchema.parse(await c.req.json());
  return c.json(await loginTenantUser(slug, email, password));
});

authRoutes.post("/admin-login", loginIpLimiter, loginEmailLimiter, async (c) => {
  const { email, password } = loginSchema.parse(await c.req.json());
  return c.json(await loginPlatformAdmin(email, password));
});

authRoutes.post("/refresh", refreshIpLimiter, async (c) => {
  const { refreshToken } = refreshSchema.parse(await c.req.json());
  return c.json(await refresh(refreshToken));
});

authRoutes.post("/logout", async (c) => {
  const { refreshToken } = refreshSchema.parse(await c.req.json());
  await logout(refreshToken);
  return c.json({ ok: true });
});
