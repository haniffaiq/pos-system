import { Pool } from "pg";

/** Pool for tenant-facing requests — subject to RLS. */
export const tenantPool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Pool for platform-admin requests — connects as a BYPASSRLS role. */
export const adminPool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
