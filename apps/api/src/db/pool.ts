import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

/** Pool for tenant-facing requests — RLS enforced. */
export const tenantPool = new Pool({ connectionString });

/**
 * Pool for platform-admin requests. Connections start with the
 * app.platform_mode GUC set to 'on' (a Postgres startup option), so RLS
 * policies allow cross-tenant access. This is the only place platform mode is
 * set — tenant code never enables it.
 */
export const adminPool = new Pool({
  connectionString,
  options: "-c app.platform_mode=on",
});
