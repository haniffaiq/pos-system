import type { MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { logger, type AppLogger } from "../lib/logger";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
    log: AppLogger;
  }
}

function safeRoutePath(c: Parameters<MiddlewareHandler>[0]): string {
  return c.req.routePath || "/:unmatched*";
}

function safeRequestId(inboundRequestId: string | undefined): string {
  return inboundRequestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inboundRequestId)
    ? inboundRequestId
    : randomUUID();
}

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const requestId = safeRequestId(c.req.header("x-request-id"));
  const log = logger.child({ request_id: requestId });
  const start = performance.now();

  c.set("requestId", requestId);
  c.set("log", log);
  c.header("x-request-id", requestId);

  try {
    await next();
  } finally {
    const auth = c.get("auth");
    const route = safeRoutePath(c);
    const durationMs = Math.round(performance.now() - start);
    log.info(
      {
        method: c.req.method,
        path: route,
        route,
        status: c.res.status,
        duration_ms: durationMs,
        latency_ms: durationMs,
        tenant_id: auth?.tenantId ?? undefined,
        user_id: auth?.sub ?? undefined,
      },
      "request completed",
    );
  }
};
