import { adminPool } from "../db/pool";
import { redis } from "../lib/redis";

export type Quota = Record<string, unknown>;

export interface TenantPlanQuota {
  status: string;
  quota: Quota;
}

const PLAN_CACHE_TTL_SECONDS = 60;
const RESOURCE_TABLES = new Set(["products", "users", "outlets"]);

const currentUtcMonthStart = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const cacheKey = (tenantId: string): string => `sub:plan:${tenantId}`;

export const isOverQuota = (limit: number, current: number): boolean => {
  if (limit < 0) return false;
  return current >= limit;
};

export const loadPlanForTenant = async (tenantId: string): Promise<TenantPlanQuota | null> => {
  const key = cacheKey(tenantId);
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as TenantPlanQuota;
    } catch {
      await redis.del(key);
    }
  }

  const { rows } = await adminPool.query<TenantPlanQuota>(
    `select s.status, p.quota
     from subscriptions s
     join plans p on p.id = s.plan_id
     where s.tenant_id = $1
       and s.status in ('trialing', 'active', 'past_due')
     order by s.created_at desc
     limit 1`,
    [tenantId],
  );

  const plan = rows[0];
  if (!plan) {
    return null;
  }

  await redis.set(cacheKey(tenantId), JSON.stringify(plan), "EX", PLAN_CACHE_TTL_SECONDS);
  return plan;
};

export const invalidatePlanCache = async (tenantId: string): Promise<void> => {
  await redis.del(cacheKey(tenantId));
};

export const currentMonthlyUsage = async (tenantId: string, metric: string): Promise<number> => {
  const { rows } = await adminPool.query<{ value: number | string }>(
    `select value
     from usage_counters
     where tenant_id = $1 and period_start = $2 and metric = $3`,
    [tenantId, currentUtcMonthStart(), metric],
  );

  return Number(rows[0]?.value ?? 0);
};

export const incrementUsage = async (tenantId: string, metric: string): Promise<void> => {
  await adminPool.query(
    `insert into usage_counters (tenant_id, period_start, metric, value)
     values ($1, $2, $3, 1)
     on conflict (tenant_id, period_start, metric) do update
     set value = usage_counters.value + 1`,
    [tenantId, currentUtcMonthStart(), metric],
  );
};

export const countResource = async (tenantId: string, table: string): Promise<number> => {
  if (!RESOURCE_TABLES.has(table)) {
    throw new Error("invalid table");
  }

  const { rows } = await adminPool.query<{ c: number | string }>(
    `select count(*)::int as c from ${table} where tenant_id = $1`,
    [tenantId],
  );

  return Number(rows[0]?.c ?? 0);
};
