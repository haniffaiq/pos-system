import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS } from "../../../../db/seeds/seed-plans";

const seedPlansPath = resolve(__dirname, "../../../../db/seeds/seed-plans.ts");

describe("seed plans", () => {
  it("defines Free, Pro, and Business plans with quota JSON used by billing and quota checks", () => {
    expect(PLANS.map((plan) => plan.code)).toEqual(["free", "pro", "business"]);
    expect(PLANS).toEqual([
      expect.objectContaining({ code: "free", name: "Free", price_idr: 0 }),
      expect.objectContaining({ code: "pro", name: "Pro", price_idr: 299000 }),
      expect.objectContaining({ code: "business", name: "Business", price_idr: 999000 }),
    ]);

    for (const plan of PLANS) {
      expect(plan.quota).toEqual(
        expect.objectContaining({
          users: expect.any(Number),
          skus: expect.any(Number),
          tx_per_month: expect.any(Number),
          exports: expect.any(Number),
          outlets: expect.any(Number),
          history_days: expect.any(Number),
          api_access: expect.any(Boolean),
          custom_domain: expect.any(Boolean),
          audit_ui: expect.any(Boolean),
        }),
      );
    }

    expect(PLANS.find((plan) => plan.code === "business")?.quota).toEqual(
      expect.objectContaining({ users: -1, skus: -1, tx_per_month: -1, api_access: true, custom_domain: true }),
    );
  });

  it("grandfathers existing tenants into Business when they do not already have a subscription", () => {
    const source = readFileSync(seedPlansPath, "utf8");

    expect(source).toContain("insert into subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)");
    expect(source).toContain("from tenants tenant");
    expect(source).toContain("join plans business on business.code = 'business'");
    expect(source).toContain("not exists (select 1 from subscriptions existing where existing.tenant_id = tenant.id)");
    expect(source).toContain("interval '100 years'");
  });
});
