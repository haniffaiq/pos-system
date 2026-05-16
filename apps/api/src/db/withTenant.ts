import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { adminPool, tenantPool } from "./pool";

export type Query = <R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<R>>;

type TransactionPool = Pick<Pool, "connect">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TenantContextOptions = {
  userId?: string;
};

/** Run a callback inside a transaction scoped to one tenant (RLS enforced). */
export function withTenant<T>(tenantId: string, fn: (q: Query) => Promise<T>): Promise<T>;
export function withTenant<T>(tenantId: string, options: TenantContextOptions, fn: (q: Query) => Promise<T>): Promise<T>;
export async function withTenant<T>(
  tenantId: string,
  optionsOrFn: TenantContextOptions | ((q: Query) => Promise<T>),
  maybeFn?: (q: Query) => Promise<T>
): Promise<T> {
  const options = typeof optionsOrFn === "function" ? {} : optionsOrFn;
  const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;

  if (!fn) {
    throw new TypeError("withTenant requires a callback");
  }
  if (!UUID_PATTERN.test(tenantId)) {
    throw new TypeError("tenantId must be a valid UUID");
  }
  if (options.userId !== undefined && !UUID_PATTERN.test(options.userId)) {
    throw new TypeError("userId must be a valid UUID");
  }

  return withTransaction(tenantPool, async (client, q) => {
    await client.query("select set_config('app.current_tenant_id', $1, true)", [tenantId]);
    if (options.userId) {
      await client.query("select set_config('app.current_user_id', $1, true)", [options.userId]);
    }
    return fn(q);
  });
}

/** Run a callback against the BYPASSRLS admin pool (platform-level queries). */
export async function withAdmin<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  return withTransaction(adminPool, async (_client, q) => fn(q));
}

async function withTransaction<T>(
  pool: TransactionPool,
  fn: (client: PoolClient, q: Query) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const q: Query = (text, params) => client.query(text, params);
    const result = await fn(client, q);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
