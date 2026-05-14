import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { adminPool, tenantPool } from "./pool";

export type Query = <R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<R>>;

type TransactionPool = Pick<Pool, "connect">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Run a callback inside a transaction scoped to one tenant (RLS enforced). */
export async function withTenant<T>(tenantId: string, fn: (q: Query) => Promise<T>): Promise<T> {
  if (!UUID_PATTERN.test(tenantId)) {
    throw new TypeError("tenantId must be a valid UUID");
  }

  return withTransaction(tenantPool, async (client, q) => {
    await client.query(`set local app.current_tenant_id = '${tenantId}'`);
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
