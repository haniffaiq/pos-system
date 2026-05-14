import type { StockInInput } from "@app/shared";

import { withTenant, type Query } from "../../db/withTenant";
import { AppError } from "../../lib/errors";
import { recordMovement } from "./stock";

export interface StockInRow {
  id: string;
  supplier_id: string | null;
  note: string | null;
  total_cost: number;
  created_at: string;
}

interface ProductUnitsRow {
  base_unit_id: string;
  bulk_unit_id: string | null;
  bulk_conversion: number | null;
}

type StockInDbRow = Omit<StockInRow, "total_cost"> & { total_cost: string | number };

function normalizeStockIn(row: StockInDbRow): StockInRow {
  return { ...row, total_cost: Number(row.total_cost) };
}

function toBaseQty(product: ProductUnitsRow, unitId: string, qty: number): number {
  if (unitId === product.base_unit_id) {
    return qty;
  }
  if (unitId === product.bulk_unit_id && product.bulk_conversion) {
    return qty * product.bulk_conversion;
  }
  throw new AppError(400, "bad_unit", "Unit does not match the product's base or bulk unit");
}

async function ensureSupplierBelongsToTenant(q: Query, supplierId: string | undefined): Promise<void> {
  if (!supplierId) {
    return;
  }
  const supplier = await q("select 1 from suppliers where id = $1", [supplierId]);
  if (!supplier.rowCount) {
    throw new AppError(400, "supplier_invalid", "Supplier does not belong to this tenant");
  }
}

async function getProductUnits(q: Query, productId: string): Promise<ProductUnitsRow> {
  const product = await q<ProductUnitsRow>("select base_unit_id, bulk_unit_id, bulk_conversion from products where id = $1", [
    productId,
  ]);
  if (!product.rowCount) {
    throw new AppError(404, "product_not_found", "Product not found");
  }
  return product.rows[0]!;
}

export function createStockIn(tenantId: string, userId: string, input: StockInInput): Promise<StockInRow> {
  return withTenant(tenantId, async (q) => {
    await ensureSupplierBelongsToTenant(q, input.supplierId);
    const totalCost = input.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);
    const header = await q<StockInDbRow>(
      `insert into stock_in(tenant_id, supplier_id, note, total_cost, created_by)
       values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4)
       returning id, supplier_id, note, total_cost, created_at`,
      [input.supplierId ?? null, input.note ?? null, totalCost, userId],
    );
    const stockIn = normalizeStockIn(header.rows[0]!);

    for (const item of input.items) {
      const product = await getProductUnits(q, item.productId);
      const baseQty = toBaseQty(product, item.unitId, item.qty);
      const subtotal = item.qty * item.unitCost;

      await q(
        `insert into stock_in_items(tenant_id, stock_in_id, product_id, unit_id, qty, unit_cost, subtotal)
         values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4, $5, $6)`,
        [stockIn.id, item.productId, item.unitId, item.qty, item.unitCost, subtotal],
      );
      await recordMovement(q, { productId: item.productId, type: "in", refId: stockIn.id, qtyBase: baseQty });
    }

    return stockIn;
  });
}

export function listStockIn(tenantId: string): Promise<StockInRow[]> {
  return withTenant(tenantId, async (q) => {
    const result = await q<StockInDbRow>(
      "select id, supplier_id, note, total_cost, created_at from stock_in order by created_at desc, id desc limit 100",
    );
    return result.rows.map(normalizeStockIn);
  });
}
