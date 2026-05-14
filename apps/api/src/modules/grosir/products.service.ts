import type { ProductInput } from "@app/shared";

import { withTenant, type Query } from "../../db/withTenant";
import { AppError } from "../../lib/errors";

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  base_unit_id: string;
  bulk_unit_id: string | null;
  bulk_conversion: number | null;
  buy_price: number;
  sell_price_eceran: number;
  sell_price_grosir: number;
  min_stock: number;
  stock_qty: number;
  is_active: boolean;
}

const COLS = `id, sku, name, category_id, base_unit_id, bulk_unit_id, bulk_conversion,
  buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty, is_active`;

type ProductDbRow = Omit<ProductRow, "buy_price" | "sell_price_eceran" | "sell_price_grosir"> & {
  buy_price: string | number;
  sell_price_eceran: string | number;
  sell_price_grosir: string | number;
};

function normalizeProduct(row: ProductDbRow | undefined): ProductRow {
  if (!row) {
    throw new AppError(404, "product_not_found", "Product not found");
  }
  return {
    ...row,
    buy_price: Number(row.buy_price),
    sell_price_eceran: Number(row.sell_price_eceran),
    sell_price_grosir: Number(row.sell_price_grosir),
  };
}

async function ensureTenantReferences(q: Query, input: ProductInput): Promise<void> {
  if (input.categoryId) {
    const category = await q("select 1 from categories where id = $1", [input.categoryId]);
    if (!category.rowCount) {
      throw new AppError(400, "category_invalid", "Category does not belong to this tenant");
    }
  }

  const baseUnit = await q("select 1 from units where id = $1", [input.baseUnitId]);
  if (!baseUnit.rowCount) {
    throw new AppError(400, "base_unit_invalid", "Base unit does not belong to this tenant");
  }

  if (input.bulkUnitId) {
    const bulkUnit = await q("select 1 from units where id = $1", [input.bulkUnitId]);
    if (!bulkUnit.rowCount) {
      throw new AppError(400, "bulk_unit_invalid", "Bulk unit does not belong to this tenant");
    }
  }
}

async function ensureSkuAvailable(q: Query, sku: string, productId?: string): Promise<void> {
  const result = await q("select 1 from products where sku = $1 and ($2::uuid is null or id <> $2::uuid)", [
    sku,
    productId ?? null,
  ]);
  if (result.rowCount) {
    throw new AppError(409, "sku_taken", "That SKU already exists");
  }
}

export function createProduct(tenantId: string, input: ProductInput): Promise<ProductRow> {
  return withTenant(tenantId, async (q) => {
    await ensureTenantReferences(q, input);
    await ensureSkuAvailable(q, input.sku);

    const result = await q<ProductDbRow>(
      `insert into products
        (tenant_id, sku, name, category_id, base_unit_id, bulk_unit_id, bulk_conversion,
         buy_price, sell_price_eceran, sell_price_grosir, min_stock)
       values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning ${COLS}`,
      [
        input.sku,
        input.name,
        input.categoryId ?? null,
        input.baseUnitId,
        input.bulkUnitId ?? null,
        input.bulkConversion ?? null,
        input.buyPrice,
        input.sellPriceEceran,
        input.sellPriceGrosir,
        input.minStock,
      ],
    );
    return normalizeProduct(result.rows[0]);
  });
}

export function listProducts(
  tenantId: string,
  filter: { search?: string; activeOnly?: boolean },
): Promise<ProductRow[]> {
  return withTenant(tenantId, async (q) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.activeOnly) {
      where.push("is_active = true");
    }
    if (filter.search) {
      params.push(`%${filter.search}%`);
      where.push(`(name ilike $${params.length} or sku ilike $${params.length})`);
    }

    const sql = `select ${COLS} from products${where.length ? ` where ${where.join(" and ")}` : ""} order by name`;
    const result = await q<ProductDbRow>(sql, params);
    return result.rows.map(normalizeProduct);
  });
}

export function getProduct(tenantId: string, id: string): Promise<ProductRow> {
  return withTenant(tenantId, async (q) => {
    const result = await q<ProductDbRow>(`select ${COLS} from products where id = $1`, [id]);
    return normalizeProduct(result.rows[0]);
  });
}

export function updateProduct(tenantId: string, id: string, input: ProductInput): Promise<ProductRow> {
  return withTenant(tenantId, async (q) => {
    await ensureTenantReferences(q, input);
    await ensureSkuAvailable(q, input.sku, id);

    const result = await q<ProductDbRow>(
      `update products set
         sku = $2,
         name = $3,
         category_id = $4,
         base_unit_id = $5,
         bulk_unit_id = $6,
         bulk_conversion = $7,
         buy_price = $8,
         sell_price_eceran = $9,
         sell_price_grosir = $10,
         min_stock = $11
       where id = $1
       returning ${COLS}`,
      [
        id,
        input.sku,
        input.name,
        input.categoryId ?? null,
        input.baseUnitId,
        input.bulkUnitId ?? null,
        input.bulkConversion ?? null,
        input.buyPrice,
        input.sellPriceEceran,
        input.sellPriceGrosir,
        input.minStock,
      ],
    );
    return normalizeProduct(result.rows[0]);
  });
}

export function setProductActive(tenantId: string, id: string, isActive: boolean): Promise<void> {
  return withTenant(tenantId, async (q) => {
    const result = await q("update products set is_active = $2 where id = $1", [id, isActive]);
    if (!result.rowCount) {
      throw new AppError(404, "product_not_found", "Product not found");
    }
  });
}
