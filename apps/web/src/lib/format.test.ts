import { describe, expect, it } from "vitest";
import { formatRupiah } from "./format";

describe("formatRupiah", () => {
  it("formats integer rupiah with thousands separators", () => {
    expect(formatRupiah(146000)).toBe("Rp 146.000");
    expect(formatRupiah(0)).toBe("Rp 0");
  });
});
