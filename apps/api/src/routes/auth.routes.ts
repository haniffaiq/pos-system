import { loginSchema, type JwtPayload } from "@app/shared";
import { Hono } from "hono";
import { z } from "zod";

import { withAdmin } from "../db/withTenant";
import { clearAuthCookies, readCsrfCookie, readRefreshCookie, setAuthCookies } from "../lib/cookies";
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
import {
  loginPlatformAdmin,
  loginTenantUser,
  logout,
  refresh,
  sendMfaChallengeEmail,
  verifyMfaChallenge,
  type LoginResult,
} from "../services/auth.service";
import { sendMfaEmail } from "../services/email.service";
import { issueEmailOtp, verifyEmailOtp } from "../services/mfa.service";

const tenantLoginSchema = loginSchema.extend({ slug: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const emailOtpSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const challengeTokenSchema = z.object({ challengeToken: z.string().min(1) });
const challengeVerifySchema = challengeTokenSchema.extend({
  method: z.enum(["totp", "email_otp"]),
  code: z.string().regex(/^\d{6}$/),
});
const loginIpLimiter = rateLimitMiddleware(loginIpRateLimit, requestIpKey);
const loginEmailLimiter = rateLimitByJsonBodyField(loginEmailRateLimit, "email");
const refreshIpLimiter = rateLimitMiddleware(refreshIpRateLimit, requestIpKey);

async function refreshTokenFromRequest(c: Parameters<typeof readRefreshCookie>[0]): Promise<string> {
  const refreshToken = await optionalRefreshTokenFromRequest(c);
  if (!refreshToken) {
    throw new AppError(400, "invalid_request", "Refresh token is required");
  }
  return refreshToken;
}

async function optionalRefreshTokenFromRequest(c: Parameters<typeof readRefreshCookie>[0]): Promise<string | undefined> {
  const cookieToken = readRefreshCookie(c);
  if (cookieToken) return cookieToken;

  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    return undefined;
  }
  const parsed = refreshSchema.safeParse(body);
  return parsed.success ? parsed.data.refreshToken : undefined;
}

function requireCsrfForCookieRefresh(c: Parameters<typeof readRefreshCookie>[0]): void {
  if (!readRefreshCookie(c)) return;

  const cookieToken = readCsrfCookie(c);
  const headerToken = c.req.header("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new AppError(403, "csrf_invalid", "Invalid CSRF token");
  }
}

function identityBody(result: LoginResult) {
  if (result.type !== "authenticated") return {};
  return "user" in result ? { user: result.user } : { admin: result.admin };
}

function authenticatedResponse(c: Parameters<typeof setAuthCookies>[0], result: LoginResult) {
  if (result.type === "mfa_required") {
    return c.json(
      {
        error: {
          code: "MFA_REQUIRED",
          message: "Multi-factor authentication is required",
          details: { challengeToken: result.challengeToken, methods: result.methods },
        },
      },
      401,
    );
  }

  setAuthCookies(c, result);
  return c.json(identityBody(result));
}

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
  return authenticatedResponse(c, await loginTenantUser(slug, email, password));
});

authRoutes.post("/admin-login", loginIpLimiter, loginEmailLimiter, async (c) => {
  const { email, password } = loginSchema.parse(await c.req.json());
  return authenticatedResponse(c, await loginPlatformAdmin(email, password));
});

authRoutes.post("/refresh", refreshIpLimiter, async (c) => {
  requireCsrfForCookieRefresh(c);
  const result = await refresh(await refreshTokenFromRequest(c));
  setAuthCookies(c, result);
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  requireCsrfForCookieRefresh(c);
  const refreshToken = await optionalRefreshTokenFromRequest(c);
  if (refreshToken) {
    await logout(refreshToken);
  }
  clearAuthCookies(c);
  return c.json({ ok: true });
});

authRoutes.post("/mfa/challenge/send-email", async (c) => {
  const { challengeToken } = challengeTokenSchema.parse(await c.req.json());
  await sendMfaChallengeEmail(challengeToken);
  return c.json({ sent: true });
});

authRoutes.post("/mfa/challenge/verify", async (c) => {
  const { challengeToken, method, code } = challengeVerifySchema.parse(await c.req.json());
  const result = await verifyMfaChallenge(challengeToken, method, code);
  setAuthCookies(c, result);
  return c.json(identityBody(result));
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
