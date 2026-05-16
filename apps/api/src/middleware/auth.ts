import type { JwtPayload } from "@app/shared";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

import { AppError } from "../lib/errors";
import { verifyAccess } from "../lib/jwt";
import { authSensitiveRateLimit, rateLimitMiddleware, requestIpKey } from "./rateLimit";

const authSensitiveLimiter = rateLimitMiddleware(
  authSensitiveRateLimit,
  (c) => c.get("auth")?.sub ?? requestIpKey(c),
);

declare module "hono" {
  interface ContextVariableMap {
    auth: JwtPayload;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : getCookie(c, "owa.access");
  if (!token) {
    throw new AppError(401, "unauthorized", "Missing access token");
  }

  try {
    const payload = await verifyAccess(token);
    c.set("auth", payload);
  } catch {
    throw new AppError(401, "unauthorized", "Invalid or expired token");
  }

  await authSensitiveLimiter(c, next);
};
