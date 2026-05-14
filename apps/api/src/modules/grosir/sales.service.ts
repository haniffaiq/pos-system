import type { SaleInput } from "@app/shared";

import { withTenant, type Query } from "../../db/withTenant";
import { AppError } from "../../lib/errors";
import { recordMovement } from "./stock";

export interface SaleRow {
  id: string;
  invoice_no: string;
  customer_name: string | null;
  total: number;
  paid: number;
  change: number;
  payment_method: string;
  created_at: string;
}

interface SaleDbRow extends Omit<SaleRow, "total" | "paid" | "change"> {
  total: string | number;
  paid: string | number;
  change: string | number;
}

interface SaleLine {
  productId: string;
  unitType: "eceran" | "grosir";
  qty: number;
  baseQty: number;
  unitPrice: number;
  subtotal: number;
}

function normalizeSale(row: SaleDbRow | undefined): SaleRow {
  if (!row) {
    throw new AppError(404, "sale_not_found", "Sale not found");
  }
  return {
    ...row,
    total: Number(row.total),
    paid: Number(row.paid),
    change: Number(row.change),
  };
}

/** Per-tenant sequential invoice number: INV-YYYYMMDD-NNNN. */
async function nextInvoiceNo(q: Query): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `INV-${today}-`;
  const result = await q<{ invoice_no: string }>(
    "select invoice_no from sales where invoice_no like $1 order by invoice_no desc limit 1",
    [`${prefix}%`],
  );
  const sequence = result.rowCount ? Number(result.rows[0]!.invoice_no.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

export function createSale(tenantId: string, userId: string, input: SaleInput): Promise<SaleRow> {
  return withTenant(tenantId, async (q) => {
    const lines: SaleLine[] = [];

    for (const item of input.items) {
      const product = await q<{
        bulk_conversion: number | null;
        sell_price_eceran: string | number;
        sell_price_grosir: string | number;
      }>("select bulk_conversion, sell_price_eceran, sell_price_grosir from products where id = $1", [item.productId]);
      if (!product.rowCount) {
        throw new AppError(404, "product_not_found", "Product not found");
      }
      const row = product.rows[0]!;
      const sellPriceEceran = Number(row.sell_price_eceran);
      const sellPriceGrosir = Number(row.sell_price_grosir);

      if (item.unitType === "grosir") {
        if (!row.bulk_conversion) {
          throw new AppError(400, "no_bulk_unit", "Product has no grosir unit");
        }
        lines.push({
          productId: item.productId,
          unitType: "grosir",
          qty: item.qty,
          baseQty: item.qty * row.bulk_conversion,
          unitPrice: sellPriceGrosir,
          subtotal: item.qty * sellPriceGrosir,
        });
      } else {
        lines.push({
          productId: item.productId,
          unitType: "eceran",
          qty: item.qty,
          baseQty: item.qty,
          unitPrice: sellPriceEceran,
          subtotal: item.qty * sellPriceEceran,
        });
      }
    }

    const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
    if (input.paid < total) {
      throw new AppError(400, "insufficient_payment", "Paid amount is less than the total");
    }

    const invoiceNo = await nextInvoiceNo(q);
    const header = await q<SaleDbRow>(
      `insert into sales(tenant_id, invoice_no, customer_name, total, paid, change, payment_method, created_by)
       values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7)
       returning id, invoice_no, customer_name, total, paid, change, payment_method, created_at`,
      [invoiceNo, input.customerName ?? null, total, input.paid, input.paid - total, input.paymentMethod, userId],
    );
    const sale = normalizeSale(header.rows[0]);

    for (const line of lines) {
      await q(
        `insert into sale_items(tenant_id, sale_id, product_id, unit_type, qty, unit_price, subtotal)
         values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4, $5, $6)`,
        [sale.id, line.productId, line.unitType, line.qty, line.unitPrice, line.subtotal],
      );
      await recordMovement(q, { productId: line.productId, type: "sale", refId: sale.id, qtyBase: -line.baseQty });
    }

    return sale;
  });
}

export function listSales(tenantId: string, filter: { from?: string; to?: string }): Promise<SaleRow[]> {
  return withTenant(tenantId, async (q) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.from) {
      params.push(filter.from);
      where.push(`created_at >= $${params.length}`);
    }
    if (filter.to) {
      params.push(filter.to);
      where.push(`created_at <= $${params.length}`);
    }

    const result = await q<SaleDbRow>(
      `select id, invoice_no, customer_name, total, paid, change, payment_method, created_at
       from sales${where.length ? ` where ${where.join(" and ")}` : ""}
       order by created_at desc, invoice_no desc
       limit 200`,
      params,
    );
    return result.rows.map(normalizeSale);
  });
}
