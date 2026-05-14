import { describe, expect, it } from "vitest";
import { tenantStatusSchema, updateTenantStatusSchema } from "./tenant";

describe("tenant schemas", () => {
  it("accepts active and suspended statuses", () => {
    expect(tenantStatusSchema.parse("active")).toBe("active");
    expect(tenantStatusSchema.parse("suspended")).toBe("suspended");
  });

  it("rejects an unknown tenant status", () => {
    expect(() => tenantStatusSchema.parse("deleted")).toThrow();
  });

  it("validates tenant status update payloads", () => {
    expect(updateTenantStatusSchema.parse({ status: "active" })).toEqual({ status: "active" });
  });

  it("rejects invalid tenant status update payloads", () => {
    expect(() => updateTenantStatusSchema.parse({ status: "paused" })).toThrow();
  });
});
