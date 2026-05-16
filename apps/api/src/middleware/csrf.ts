import type { MiddlewareHandler } from "hono";

import { readAccessCookie, readCsrfCookie, readRefreshCookie } from "../lib/cookies";
import { AppError } from "../lib/errors";
import { verifyAccess, verifyRefresh } from "../lib/jwt";
import { isCsrfBoundToRefresh } from "../lib/refreshStore";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const BOOTSTRAP_EXEMPTIONS = new Set([
  "POST /api/v1/auth/tenant-login",
  "POST /api/v1/auth/admin-login",
  "POST /api/v1/auth/mfa/challenge/send-email",
  "POST /api/v1/auth/mfa/challenge/verify",
]);

function isExempt(method: string, path: string): boolean {
  return BOOTSTRAP_EXEMPTIONS.has(`${method.toUpperCase()} ${path}`);
}

export const csrfMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (!UNSAFE_METHODS.has(method) || isExempt(method, new URL(c.req.url).pathname)) {
    await next();
    return;
  }

  const accessCookie = readAccessCookie(c);
  const refreshCookie = readRefreshCookie(c);
  if (!accessCookie && !refreshCookie) {
    await next();
    return;
  }

  const cookieToken = readCsrfCookie(c);
  const headerToken = c.req.header("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new AppError(403, "csrf_invalid", "Invalid CSRF token");
  }

  let subject: string | undefined;
  let sessionJti: string | undefined;
  if (refreshCookie) {
    try {
      const refresh = await verifyRefresh(refreshCookie);
      subject = refresh.sub;
      sessionJti = refresh.jti;
    } catch {
      throw new AppError(403, "csrf_invalid", "Invalid CSRF token");
    }
  } else if (accessCookie) {
    try {
      const access = await verifyAccess(accessCookie);
      subject = access.sub;
      sessionJti = access.sessionJti;
    } catch {
      throw new AppError(403, "csrf_invalid", "Invalid CSRF token");
    }
  }

  if (!subject || !sessionJti || !(await isCsrfBoundToRefresh(subject, sessionJti, cookieToken))) {
    throw new AppError(403, "csrf_invalid", "Invalid CSRF token");
  }

  await next();
};
