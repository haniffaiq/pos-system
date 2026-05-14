import { z } from "zod";

const money = z.number().int().nonnegative();
const positiveQuantity = z.number().int().positive();

export const categorySchema = z.object({
  name: z.string().min(1),
});

export const unitSchema = z.object({
  name: z.string().min(1),
});

export const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const productSchema = z
  .object({
    sku: z.string().min(1),
    name: z.string().min(1),
    categoryId: z.string().optional(),
    baseUnitId: z.string().min(1),
    bulkUnitId: z.string().optional(),
    bulkConversion: z.number().int().min(2).optional(),
    buyPrice: money,
    sellPriceEceran: money,
    sellPriceGrosir: money,
    minStock: z.number().int().nonnegative(),
  })
  .refine((product) => !product.bulkUnitId || product.bulkConversion !== undefined, {
    message: "bulkConversion is required when bulkUnitId is set",
    path: ["bulkConversion"],
  });

export const stockInSchema = z.object({
  supplierId: z.string().optional(),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        unitId: z.string().min(1),
        qty: positiveQuantity,
        unitCost: money,
      }),
    )
    .min(1),
});

export const saleSchema = z.object({
  customerName: z.string().optional(),
  paymentMethod: z.enum(["cash", "transfer", "qris"]).default("cash"),
  paid: money,
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        unitType: z.enum(["eceran", "grosir"]),
        qty: positiveQuantity,
      }),
    )
    .min(1),
});

export const adjustmentSchema = z.object({
  productId: z.string().min(1),
  qtyBase: z.number().int().refine((quantity) => quantity !== 0, "qtyBase cannot be zero"),
  reason: z.enum(["rusak", "hilang", "koreksi"]),
  note: z.string().optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type UnitInput = z.infer<typeof unitSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type StockInInput = z.infer<typeof stockInSchema>;
export type SaleInput = z.infer<typeof saleSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
