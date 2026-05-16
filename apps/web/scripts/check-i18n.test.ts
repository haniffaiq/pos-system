import { describe, expect, it } from "vitest";
import { collectLeafKeys, compareCatalogKeys, formatCoverageReport } from "./check-i18n";

describe("i18n catalog coverage", () => {
  it("flattens nested leaf keys with dot notation", () => {
    expect(collectLeafKeys({
      brand: "BroSolution",
      nav: { home: "Home", cta: "Start" },
      errors: { empty: "" },
    })).toEqual(["brand", "errors.empty", "nav.cta", "nav.home"]);
  });

  it("reports keys missing from each locale", () => {
    const result = compareCatalogKeys(
      { brand: "BroSolution", nav: { home: "Beranda" }, checkout: { pay: "Bayar" } },
      { brand: "BroSolution", nav: { home: "Home", pricing: "Pricing" } },
    );

    expect(result).toEqual({
      totalIdKeys: 3,
      totalEnKeys: 3,
      missingInEn: ["checkout.pay"],
      missingInId: ["nav.pricing"],
    });
  });

  it("formats a failing report with both missing-key lists", () => {
    expect(formatCoverageReport({
      totalIdKeys: 2,
      totalEnKeys: 2,
      missingInEn: ["billing.title"],
      missingInId: ["marketing.hero"],
    })).toContain("Missing in EN: billing.title");
    expect(formatCoverageReport({
      totalIdKeys: 2,
      totalEnKeys: 2,
      missingInEn: ["billing.title"],
      missingInId: ["marketing.hero"],
    })).toContain("Missing in ID: marketing.hero");
  });
});
