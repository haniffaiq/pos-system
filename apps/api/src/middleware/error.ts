import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import { AppError } from "../lib/errors.js";
import { logger, toLogError } from "../lib/logger";
import { Sentry } from "../lib/sentry.js";

export function onError(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    const error: { code: string; message: string; details?: unknown } = {
      code: err.code,
      message: err.message,
    };

    if (err.details !== undefined) {
      error.details = err.details;
    }

    return c.json({ error }, err.status as ContentfulStatusCode);
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "validation_error",
          message: "Invalid input",
          details: err.flatten(),
        },
      },
      400,
    );
  }

  logger.error({ error: toLogError(err) }, "unhandled request error");
  Sentry.captureException(err);
  return c.json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
}
