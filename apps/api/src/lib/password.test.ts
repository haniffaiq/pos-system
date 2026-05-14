import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("hashes then verifies the same password", async () => {
    const plain = "secret12";

    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(await verifyPassword(hash, plain)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("secret12");

    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("rejects malformed password hashes", async () => {
    expect(await verifyPassword("not-an-argon2-hash", "secret12")).toBe(false);
  });
});
