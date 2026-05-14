import type { JwtPayload } from "@app/shared";
import type { MiddlewareHandler } from "hono";

import { AppError } from "../lib/errors";

type AllowedRole = JwtPayload["role"];

export function requireRole(...roles: AllowedRole[]): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth || !roles.includes(auth.role)) {
      throw new AppError(403, "forbidden", "You do not have access to this action");
    }

    await next();
  };
}
