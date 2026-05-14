import { describe, expect, it } from "vitest";

import { AppError } from "./errors";

describe("AppError", () => {
  it("carries status, code, message, and optional details", () => {
    const details = { tenantId: "missing" };
    const error = new AppError(404, "not_found", "Tenant not found", details);

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(404);
    expect(error.code).toBe("not_found");
    expect(error.message).toBe("Tenant not found");
    expect(error.details).toBe(details);
  });
});
