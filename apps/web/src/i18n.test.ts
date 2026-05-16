import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import id from "../messages/id.json";

function keys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, nested]) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? keys(nested as Record<string, unknown>, prefix ? `${prefix}.${key}` : key)
      : [prefix ? `${prefix}.${key}` : key],
  );
}

describe("message catalogs", () => {
  it("keeps Indonesian and English catalogs in sync with Indonesian default copy", () => {
    expect(keys(en).sort()).toEqual(keys(id).sort());
    expect(id.tagline).toBe("Solusi Operasional Grosir, Tanpa Ribet.");
    expect(id.nav.features).toBe("Fitur");
    expect(id.hero.title).toBe("Kelola Grosirmu Lebih Cepat");
    expect(en.footer.rights).toBe("© 2026 BroSolution. All rights reserved.");
  });
});
