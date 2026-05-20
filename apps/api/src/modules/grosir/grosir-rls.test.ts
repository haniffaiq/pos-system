import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminPool, tenantPool } from "../../db/pool";
import { withTenant } from "../../db/withTenant";

const databaseUrl = process.env.DATABASE_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

const TENANT_SCOPED_GROSIR_TABLES = [
  "categories",
  "units",
  "suppliers",
  "products",
  "stock_in",
  "stock_in_items",
  "sales",
  "sale_items",
  "stock_adjustments",
  "stock_movements",
  "notifications",
  "export_jobs",
] as const;

interface TenantFixture {
  tenantId: string;
  userId: string;
  unitId: string;
  productId: string;
  productDeleteId: string;
  saleId: string;
  saleDeleteId: string;
  stockMovementId: string;
  stockMovementDeleteId: string;
}

let tenantA: TenantFixture;
let tenantB: TenantFixture;

async function createTenantFixture(label: string): Promise<TenantFixture> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenant = await adminPool.query<{ id: string }>(
    "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
    [`Grosir RLS ${label} ${suffix}`, `grosir-rls-${label.toLowerCase()}-${suffix}`],
  );
  const tenantId = tenant.rows[0]!.id;

  const user = await adminPool.query<{ id: string }>(
    "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', $3, 'owner') returning id",
    [tenantId, `grosir-rls-${label.toLowerCase()}-${suffix}@test.local`, `Owner ${label}`],
  );
  const userId = user.rows[0]!.id;

  const unit = await adminPool.query<{ id: string }>(
    "insert into units(tenant_id, name) values ($1, $2) returning id",
    [tenantId, `pcs-${suffix}`],
  );
  const unitId = unit.rows[0]!.id;

  const product = await adminPool.query<{ id: string }>(
    `insert into products(tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty)
     values ($1, $2, $3, $4, 1000, 1200, 11000, 0, 10) returning id`,
    [tenantId, `${label}-SKU-${suffix}`, `Product ${label}`, unitId],
  );
  const productId = product.rows[0]!.id;

  const productDelete = await adminPool.query<{ id: string }>(
    `insert into products(tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock, stock_qty)
     values ($1, $2, $3, $4, 1000, 1200, 11000, 0, 0) returning id`,
    [tenantId, `${label}-DEL-${suffix}`, `Delete Product ${label}`, unitId],
  );
  const productDeleteId = productDelete.rows[0]!.id;

  const sale = await adminPool.query<{ id: string }>(
    `insert into sales(tenant_id, invoice_no, customer_name, total, paid, change, payment_method, created_by)
     values ($1, $2, $3, 1200, 2000, 800, 'cash', $4) returning id`,
    [tenantId, `${label}-INV-${suffix}`, `Customer ${label}`, userId],
  );
  const saleId = sale.rows[0]!.id;

  const saleDelete = await adminPool.query<{ id: string }>(
    `insert into sales(tenant_id, invoice_no, customer_name, total, paid, change, payment_method, created_by)
     values ($1, $2, $3, 1200, 2000, 800, 'cash', $4) returning id`,
    [tenantId, `${label}-DEL-INV-${suffix}`, `Delete Customer ${label}`, userId],
  );
  const saleDeleteId = saleDelete.rows[0]!.id;

  const stockMovement = await adminPool.query<{ id: string }>(
    `insert into stock_movements(tenant_id, product_id, type, ref_id, qty_base, balance_after)
     values ($1, $2, 'in', $2, 10, 10) returning id`,
    [tenantId, productId],
  );
  const stockMovementId = stockMovement.rows[0]!.id;

  const stockMovementDelete = await adminPool.query<{ id: string }>(
    `insert into stock_movements(tenant_id, product_id, type, ref_id, qty_base, balance_after)
     values ($1, $2, 'adjustment', $2, -1, 9) returning id`,
    [tenantId, productId],
  );
  const stockMovementDeleteId = stockMovementDelete.rows[0]!.id;

  return {
    tenantId,
    userId,
    unitId,
    productId,
    productDeleteId,
    saleId,
    saleDeleteId,
    stockMovementId,
    stockMovementDeleteId,
  };
}

describeWithDatabase("grosir RLS isolation", () => {
  beforeAll(async () => {
    tenantA = await createTenantFixture("A");
    tenantB = await createTenantFixture("B");
  });

  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("enables RLS and the tenant isolation policy on every tenant-scoped grosir table", async () => {
    const result = await adminPool.query<{ relname: string; relrowsecurity: boolean; policy_count: number }>(
      `select c.relname, c.relrowsecurity, count(p.polname)::int as policy_count
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_policy p on p.polrelid = c.oid and p.polname = 'tenant_isolation'
       where n.nspname = 'public' and c.relname = any($1::text[])
       group by c.relname, c.relrowsecurity
       order by c.relname`,
      [[...TENANT_SCOPED_GROSIR_TABLES]],
    );

    expect(result.rows).toHaveLength(TENANT_SCOPED_GROSIR_TABLES.length);
    expect(result.rows).toEqual(
      TENANT_SCOPED_GROSIR_TABLES.map((table) => ({ relname: table, relrowsecurity: true, policy_count: 1 })).sort(
        (a, b) => a.relname.localeCompare(b.relname),
      ),
    );
  });

  it("tenant A cannot SELECT tenant B products, sales, or stock movements", async () => {
    const visible = await withTenant(tenantA.tenantId, async (q) => {
      const products = await q<{ id: string }>("select id from products where id = any($1::uuid[]) order by id", [
        [tenantA.productId, tenantB.productId],
      ]);
      const sales = await q<{ id: string }>("select id from sales where id = any($1::uuid[]) order by id", [
        [tenantA.saleId, tenantB.saleId],
      ]);
      const movements = await q<{ id: string }>("select id from stock_movements where id = any($1::uuid[]) order by id", [
        [tenantA.stockMovementId, tenantB.stockMovementId],
      ]);

      return { products: products.rows, sales: sales.rows, movements: movements.rows };
    });

    expect(visible.products).toEqual([{ id: tenantA.productId }]);
    expect(visible.sales).toEqual([{ id: tenantA.saleId }]);
    expect(visible.movements).toEqual([{ id: tenantA.stockMovementId }]);
  });

  it("tenant A cannot UPDATE tenant B grosir rows", async () => {
    const affected = await withTenant(tenantA.tenantId, async (q) => {
      const products = await q("update products set name = 'HACKED' where id = any($1::uuid[])", [
        [tenantA.productId, tenantB.productId],
      ]);
      const sales = await q("update sales set customer_name = 'HACKED' where id = any($1::uuid[])", [
        [tenantA.saleId, tenantB.saleId],
      ]);
      const movements = await q("update stock_movements set balance_after = 99 where id = any($1::uuid[])", [
        [tenantA.stockMovementId, tenantB.stockMovementId],
      ]);

      return {
        products: products.rowCount,
        sales: sales.rowCount,
        movements: movements.rowCount,
      };
    });

    expect(affected).toEqual({ products: 1, sales: 1, movements: 1 });

    const bRows = await adminPool.query<{ product_name: string; customer_name: string; balance_after: number }>(
      `select p.name as product_name, s.customer_name, sm.balance_after
       from products p
       cross join sales s
       cross join stock_movements sm
       where p.id = $1 and s.id = $2 and sm.id = $3`,
      [tenantB.productId, tenantB.saleId, tenantB.stockMovementId],
    );
    expect(bRows.rows[0]).toEqual({ product_name: "Product B", customer_name: "Customer B", balance_after: 10 });
  });

  it("tenant A cannot DELETE tenant B grosir rows", async () => {
    const affected = await withTenant(tenantA.tenantId, async (q) => {
      const product = await q("delete from products where id = $1", [tenantB.productDeleteId]);
      const sale = await q("delete from sales where id = $1", [tenantB.saleDeleteId]);
      const movement = await q("delete from stock_movements where id = $1", [tenantB.stockMovementDeleteId]);

      return { product: product.rowCount, sale: sale.rowCount, movement: movement.rowCount };
    });

    expect(affected).toEqual({ product: 0, sale: 0, movement: 0 });

    const remaining = await adminPool.query<{ products: number; sales: number; movements: number }>(
      `select
         (select count(*)::int from products where id = $1) as products,
         (select count(*)::int from sales where id = $2) as sales,
         (select count(*)::int from stock_movements where id = $3) as movements`,
      [tenantB.productDeleteId, tenantB.saleDeleteId, tenantB.stockMovementDeleteId],
    );
    expect(remaining.rows[0]).toEqual({ products: 1, sales: 1, movements: 1 });
  });

  it("tenant A cannot INSERT a product with tenant B's tenant_id", async () => {
    await expect(
      withTenant(tenantA.tenantId, async (q) =>
        q(
          `insert into products(tenant_id, sku, name, base_unit_id, buy_price, sell_price_eceran, sell_price_grosir, min_stock)
           values ($1, $2, 'Spoofed Product', $3, 1, 1, 1, 0)`,
          [tenantB.tenantId, `EVIL-${crypto.randomUUID().slice(0, 8)}`, tenantB.unitId],
        ),
      ),
    ).rejects.toThrow();
  });
});
