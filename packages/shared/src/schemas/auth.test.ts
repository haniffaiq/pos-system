import { describe, expect, it } from "vitest";
import { loginSchema, registerTenantSchema } from "./auth";

const validRegistration = {
  name: "Toko A",
  slug: "toko-a",
  sector: "grosir",
  ownerEmail: "owner@example.com",
  ownerPassword: "secret12",
};

describe("auth schemas", () => {
  it("accepts a valid login", () => {
    expect(loginSchema.parse({ email: "a@b.com", password: "secret12" })).toBeTruthy();
  });

  it("accepts the seeded local admin login identifier", () => {
    expect(loginSchema.parse({ email: "admin@local", password: "admin123" })).toBeTruthy();
  });

  it("rejects a short login password", () => {
    expect(() => loginSchema.parse({ email: "a@b.com", password: "x" })).toThrow();
  });

  it("rejects a malformed login email", () => {
    expect(() => loginSchema.parse({ email: "not-an-email", password: "secret12" })).toThrow();
  });

  it("accepts a valid tenant registration", () => {
    expect(registerTenantSchema.parse(validRegistration)).toEqual(validRegistration);
  });

  it("rejects a bad sector on register", () => {
    expect(() =>
      registerTenantSchema.parse({
        ...validRegistration,
        sector: "spaceship",
      }),
    ).toThrow();
  });

  it("rejects a register slug with uppercase or spaces", () => {
    expect(() =>
      registerTenantSchema.parse({
        ...validRegistration,
        slug: "Toko A",
      }),
    ).toThrow();
  });
});
