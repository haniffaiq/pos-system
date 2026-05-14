import { withTenant } from "../../db/withTenant";

export interface Dashboard {
  todaySalesTotal: number;
  todayTxnCount: number;
  lowStockCount: number;
  topProducts: { product_id: string; name: string; qty_sold: number }[];
}

export function getDashboard(tenantId: string): Promise<Dashboard> {
  return withTenant(tenantId, async (q) => {
    const today = await q<{ total: string | number; count: string | number }>(
      `select coalesce(sum(total), 0)::bigint as total, count(*)::int as count
       from sales
       where created_at::date = current_date`,
    );
    const lowStock = await q<{ n: number }>(
      "select count(*)::int as n from products where is_active and stock_qty <= min_stock",
    );
    const top = await q<{ product_id: string; name: string; qty_sold: string | number }>(
      `select si.product_id, p.name, sum(si.qty)::int as qty_sold
       from sale_items si
       join sales s on s.id = si.sale_id
       join products p on p.id = si.product_id
       where s.created_at >= current_date - interval '30 days'
       group by si.product_id, p.name
       order by qty_sold desc, p.name asc
       limit 5`,
    );

    return {
      todaySalesTotal: Number(today.rows[0]?.total ?? 0),
      todayTxnCount: Number(today.rows[0]?.count ?? 0),
      lowStockCount: Number(lowStock.rows[0]?.n ?? 0),
      topProducts: top.rows.map((row) => ({
        product_id: row.product_id,
        name: row.name,
        qty_sold: Number(row.qty_sold),
      })),
    };
  });
}
