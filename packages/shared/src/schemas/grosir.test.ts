import { describe, expect, it } from "vitest";
import {
  adjustmentSchema,
  categorySchema,
  productSchema,
  saleSchema,
  stockInSchema,
  supplierSchema,
  unitSchema,
} from "./grosir";

describe("grosir schemas", () => {
  it("accepts valid category, unit, and supplier payloads", () => {
    expect(categorySchema.parse({ name: "Sembako" })).toEqual({ name: "Sembako" });
    expect(unitSchema.parse({ name: "pcs" })).toEqual({ name: "pcs" });
    expect(
      supplierSchema.parse({ name: "Supplier A", phone: "08123456789", address: "Jl. Pasar" }),
    ).toEqual({ name: "Supplier A", phone: "08123456789", address: "Jl. Pasar" });
  });

  it("accepts a valid product", () => {
    expect(
      productSchema.parse({
        sku: "BRS-5",
        name: "Beras 5kg",
        categoryId: "c1",
        baseUnitId: "u1",
        bulkUnitId: "u2",
        bulkConversion: 10,
        buyPrice: 60000,
        sellPriceEceran: 65000,
        sellPriceGrosir: 640000,
        minStock: 5,
      }),
    ).toBeTruthy();
  });

  it("rejects products with invalid money or bulk conversion values", () => {
    const product = {
      sku: "X",
      name: "X",
      baseUnitId: "u1",
      buyPrice: 1,
      sellPriceEceran: 1,
      sellPriceGrosir: 1,
      minStock: 0,
    };

    expect(() => productSchema.parse({ ...product, bulkUnitId: "u2" })).toThrow();
    expect(() => productSchema.parse({ ...product, bulkConversion: 1 })).toThrow();
    expect(() => productSchema.parse({ ...product, buyPrice: -1 })).toThrow();
    expect(() => productSchema.parse({ ...product, sellPriceEceran: 1.5 })).toThrow();
  });

  it("accepts stock-in lines with positive quantities and integer Rupiah costs", () => {
    expect(
      stockInSchema.parse({
        supplierId: "s1",
        note: "kulakan",
        items: [{ productId: "p1", unitId: "u1", qty: 2, unitCost: 12000 }],
      }),
    ).toBeTruthy();
  });

  it("rejects empty stock-in or invalid stock-in quantities", () => {
    expect(() => stockInSchema.parse({ items: [] })).toThrow();
    expect(() =>
      stockInSchema.parse({ items: [{ productId: "p1", unitId: "u1", qty: 0, unitCost: 12000 }] }),
    ).toThrow();
    expect(() =>
      stockInSchema.parse({ items: [{ productId: "p1", unitId: "u1", qty: 1, unitCost: 12.5 }] }),
    ).toThrow();
  });

  it("accepts a valid sale", () => {
    expect(
      saleSchema.parse({
        customerName: "Budi",
        items: [{ productId: "p1", unitType: "eceran", qty: 2 }],
        paid: 130000,
        paymentMethod: "cash",
      }),
    ).toBeTruthy();
  });

  it("rejects sales with no items, invalid quantities, or non-integer money", () => {
    expect(() => saleSchema.parse({ items: [], paid: 0, paymentMethod: "cash" })).toThrow();
    expect(() =>
      saleSchema.parse({
        items: [{ productId: "p1", unitType: "grosir", qty: 0 }],
        paid: 1000,
        paymentMethod: "cash",
      }),
    ).toThrow();
    expect(() =>
      saleSchema.parse({
        items: [{ productId: "p1", unitType: "eceran", qty: 1 }],
        paid: 10.5,
        paymentMethod: "cash",
      }),
    ).toThrow();
  });

  it("accepts signed nonzero stock adjustments", () => {
    expect(adjustmentSchema.parse({ productId: "p1", qtyBase: -2, reason: "rusak" })).toBeTruthy();
    expect(adjustmentSchema.parse({ productId: "p1", qtyBase: 2, reason: "koreksi", note: "audit" })).toBeTruthy();
  });

  it("rejects zero stock adjustments", () => {
    expect(() => adjustmentSchema.parse({ productId: "p1", qtyBase: 0, reason: "hilang" })).toThrow();
  });
});
