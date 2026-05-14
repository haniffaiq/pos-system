import type { Query } from "../../db/withTenant";
import { AppError } from "../../lib/errors";

export interface MovementInput {
  productId: string;
  type: "in" | "sale" | "adjustment";
  refId: string;
  qtyBase: number;
}

/** Insert a stock movement and update the cached product balance. Returns the new balance. */
export async function recordMovement(q: Query, movement: MovementInput): Promise<number> {
  const current = await q<{ stock_qty: number }>("select stock_qty from products where id = $1 for update", [
    movement.productId,
  ]);

  if (!current.rowCount) {
    throw new AppError(404, "product_not_found", "Product not found");
  }

  const balanceAfter = current.rows[0]!.stock_qty + movement.qtyBase;
  if (balanceAfter < 0) {
    throw new AppError(409, "insufficient_stock", "Not enough stock for this movement");
  }

  await q(
    `insert into stock_movements (tenant_id, product_id, type, ref_id, qty_base, balance_after)
     values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4, $5)`,
    [movement.productId, movement.type, movement.refId, movement.qtyBase, balanceAfter],
  );
  await q("update products set stock_qty = $1 where id = $2", [balanceAfter, movement.productId]);

  return balanceAfter;
}
