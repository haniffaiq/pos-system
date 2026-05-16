import { Pool } from "pg";

export const PLANS = [
  {
    code: "free",
    name: "Free",
    price_idr: 0,
    quota: {
      users: 2,
      skus: 100,
      tx_per_month: 500,
      exports: 5,
      outlets: 1,
      history_days: 30,
      api_access: false,
      custom_domain: false,
      audit_ui: false,
    },
  },
  {
    code: "pro",
    name: "Pro",
    price_idr: 299000,
    quota: {
      users: 10,
      skus: 5000,
      tx_per_month: 20000,
      exports: 100,
      outlets: 3,
      history_days: 365,
      api_access: false,
      custom_domain: false,
      audit_ui: true,
    },
  },
  {
    code: "business",
    name: "Business",
    price_idr: 999000,
    quota: {
      users: -1,
      skus: -1,
      tx_per_month: -1,
      exports: -1,
      outlets: -1,
      history_days: -1,
      api_access: true,
      custom_domain: true,
      audit_ui: true,
    },
  },
] as const;

export async function seedPlans(pool: Pool) {
  for (const plan of PLANS) {
    await pool.query(
      `insert into plans (code, name, price_idr, quota)
       values ($1, $2, $3, $4::jsonb)
       on conflict (code) do update
         set name = excluded.name,
             price_idr = excluded.price_idr,
             quota = excluded.quota,
             is_active = true,
             updated_at = now()`,
      [plan.code, plan.name, plan.price_idr, JSON.stringify(plan.quota)],
    );
  }

  await pool.query(
    `insert into subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
     select tenant.id, business.id, 'active', now(), now() + interval '100 years'
     from tenants tenant
     join plans business on business.code = 'business'
     where not exists (select 1 from subscriptions existing where existing.tenant_id = tenant.id)`,
  );
}

async function main() {
  if (!process.env.DATABASE_ADMIN_URL) {
    console.error("DATABASE_ADMIN_URL is required to seed billing plans");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
  try {
    await seedPlans(pool);
    console.log("billing plans seeded: free, pro, business");
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seed-plans.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
