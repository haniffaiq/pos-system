import type { AdjustmentInput } from "@app/shared";

import { withTenant } from "../../db/withTenant";
import { recordMovement } from "./stock";

export interface AdjustmentRow {
  id: string;
  product_id: string;
  qty_base: number;
  reason: "rusak" | "hilang" | "koreksi";
  note: string | null;
  created_at: string;
}

export function createAdjustment(tenantId: string, userId: string, input: AdjustmentInput): Promise<AdjustmentRow> {
  return withTenant(tenantId, async (q) => {
    const inserted = await q<AdjustmentRow>(
      `insert into stock_adjustments (tenant_id, product_id, qty_base, reason, note, created_by)
       values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4, $5)
       returning id, product_id, qty_base, reason, note, created_at`,
      [input.productId, input.qtyBase, input.reason, input.note ?? null, userId],
    );
    const adjustment = inserted.rows[0]!;

    await recordMovement(q, {
      productId: input.productId,
      type: "adjustment",
      refId: adjustment.id,
      qtyBase: input.qtyBase,
    });

    return adjustment;
  });
}

export function listAdjustments(tenantId: string): Promise<AdjustmentRow[]> {
  return withTenant(tenantId, async (q) => {
    const result = await q<AdjustmentRow>(
      `select id, product_id, qty_base, reason, note, created_at
       from stock_adjustments
       order by created_at desc
       limit 100`,
    );
    return result.rows;
  });
}
