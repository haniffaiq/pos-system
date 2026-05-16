import { loginSchema, type JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { z } from "zod";

import { withAdmin } from "../db/withTenant";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import {
  loginEmailRateLimit,
  loginIpRateLimit,
  rateLimitByJsonBodyField,
  rateLimitMiddleware,
  refreshIpRateLimit,
  requestIpKey,
} from "../middleware/rateLimit";
import { loginPlatformAdmin, loginTenantUser, logout, refresh } from "../services/auth.service";
import { sendMfaEmail } from "../services/email.service";
import { issueEmailOtp, verifyEmailOtp } from "../services/mfa.service";

const tenantLoginSchema = loginSchema.extend({ slug: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const emailOtpSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const loginIpLimiter = rateLimitMiddleware(loginIpRateLimit, requestIpKey);
const loginEmailLimiter = rateLimitByJsonBodyField(loginEmailRateLimit, "email");
const refreshIpLimiter = rateLimitMiddleware(refreshIpRateLimit, requestIpKey);

export const authRoutes = new Hono<{ Variables: { auth: JwtPayload } }>();

async function emailForMfa(auth: JwtPayload): Promise<string> {
  const email = await withAdmin(async (q) => {
    if (auth.role === "platform_admin") {
      const result = await q<{ email: string }>("select email from platform_admins where id = $1", [auth.sub]);
      return result.rows[0]?.email;
    }

    const result = await q<{ email: string }>("select email from users where id = $1 and tenant_id = $2", [
      auth.sub,
      auth.tenantId,
    ]);
    return result.rows[0]?.email;
  });

  if (!email) {
    throw new AppError(404, "user_not_found", "Authenticated user was not found");
  }
  return email;
}

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

authRoutes.post("/mfa/email-otp/send", authMiddleware, async (c) => {
  const auth = c.get("auth");
  const code = await issueEmailOtp(auth.sub);
  const email = await emailForMfa(auth);
  await sendMfaEmail(email, code, auth.sub);
  return c.json({ sent: true });
});

authRoutes.post("/mfa/email-otp/verify", authMiddleware, async (c) => {
  const auth = c.get("auth");
  const { code } = emailOtpSchema.parse(await c.req.json());
  const ok = await verifyEmailOtp(auth.sub, code);
  if (!ok) {
    throw new AppError(401, "invalid_otp", "Invalid or expired OTP");
  }
  return c.json({ ok: true });
});
