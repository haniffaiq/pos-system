import type { Job } from "bullmq";

import { withAdmin } from "../../db/withTenant";
import type { LowStockScanJob } from "../queues";

export async function lowStockProcessor(_job: Job<LowStockScanJob>): Promise<void> {
  await withAdmin(async (q) => {
    await q(
      `insert into notifications (tenant_id, type, title, body, metadata)
       select
         p.tenant_id,
         'low_stock',
         'Stok menipis',
         p.name || ' tersisa ' || p.stock_qty || ' (minimum ' || p.min_stock || ')',
         jsonb_build_object(
           'product_id', p.id::text,
           'stock_qty', p.stock_qty,
           'min_stock', p.min_stock
         )
        from products p
        join tenants t on t.id = p.tenant_id
       where t.status = 'active'
         and p.is_active = true
         and p.stock_qty <= p.min_stock
         and not exists (
           select 1
             from notifications n
            where n.tenant_id = p.tenant_id
              and n.type = 'low_stock'
              and n.is_read = false
              and n.metadata->>'product_id' = p.id::text
         )
       on conflict do nothing`,
    );
  });
}
