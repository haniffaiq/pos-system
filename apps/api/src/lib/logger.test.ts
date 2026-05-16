import { describe, expect, it } from "vitest";

import { createLogger, logger, redactPaths, toLogError } from "./logger";

describe("logger", () => {
  it("redacts sensitive fields", () => {
    expect(redactPaths).toContain("password");
    expect(redactPaths).toContain("token");
    expect(redactPaths).toContain("secret_encrypted");
    expect(redactPaths).toContain("*.password");
  });

  it("censors sensitive values in emitted JSON", () => {
    const writes: string[] = [];
    const testLogger = createLogger({ write: (msg) => writes.push(msg) });

    testLogger.info(
      {
        password: "super-secret-password",
        token: "super-secret-token",
        nested: { secret_encrypted: "ciphertext" },
      },
      "redaction check",
    );

    const emitted = writes.join("");
    expect(emitted).toContain("[REDACTED]");
    expect(emitted).not.toContain("super-secret-password");
    expect(emitted).not.toContain("super-secret-token");
    expect(emitted).not.toContain("ciphertext");
  });

  it("exposes a child method", () => {
    const child = logger.child({ scope: "test" });
    expect(typeof child.info).toBe("function");
  });

  it("serializes errors without messages or stacks", () => {
    const error = new Error("database password leaked");

    expect(toLogError(error)).toEqual({ name: "Error" });
  });
});
