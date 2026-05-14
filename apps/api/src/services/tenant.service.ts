import type { RegisterTenantInput, Role, Sector, TenantStatus } from "@app/shared";
import { withAdmin, type Query } from "../db/withTenant";
import { AppError } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { provisioningQueue } from "../queue/queues";

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  sector: Sector;
  status: TenantStatus;
  created_at: Date;
}

export interface TenantUserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: TenantStatus;
}

export type TenantDetail = TenantRow & {
  users: TenantUserRow[];
  owner: TenantUserRow;
};

export interface TenantListFilter {
  status?: TenantStatus;
  search?: string;
}

async function audit(q: Query, adminId: string, action: string, target: string): Promise<void> {
  await q("insert into platform_audit_log(admin_id, action, target) values ($1, $2, $3)", [
    adminId,
    action,
    target,
  ]);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function slugTakenError(): AppError {
  return new AppError(409, "slug_taken", "That slug is already in use");
}

export async function createTenant(input: RegisterTenantInput, adminId: string): Promise<TenantRow> {
  const passwordHash = await hashPassword(input.ownerPassword);

  try {
    const tenant = await withAdmin(async (q) => {
      const duplicate = await q("select 1 from tenants where slug = $1", [input.slug]);
      if (duplicate.rowCount) {
        throw slugTakenError();
      }

      const tenantResult = await q<TenantRow>(
        `insert into tenants(name, slug, sector)
         values ($1, $2, $3)
         returning id, name, slug, sector, status, created_at`,
        [input.name, input.slug, input.sector],
      );
      const tenant = tenantResult.rows[0]!;

      await q(
        `insert into users(tenant_id, email, password_hash, name, role)
         values ($1, $2, $3, $4, 'owner')`,
        [tenant.id, input.ownerEmail, passwordHash, `${input.name} Owner`],
      );
      await audit(q, adminId, "tenant.create", tenant.id);

      return tenant;
    });

    await provisioningQueue.add("provision", { tenantId: tenant.id });
    return tenant;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (isUniqueViolation(error)) {
      throw slugTakenError();
    }
    throw error;
  }
}

export async function listTenants(filter: TenantListFilter = {}): Promise<TenantRow[]> {
  return withAdmin(async (q) => {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }

    const search = filter.search?.trim();
    if (search) {
      params.push(`%${search}%`);
      where.push(`(name ilike $${params.length} or slug ilike $${params.length})`);
    }

    const { rows } = await q<TenantRow>(
      `select id, name, slug, sector, status, created_at
       from tenants${where.length ? ` where ${where.join(" and ")}` : ""}
       order by created_at desc`,
      params,
    );
    return rows;
  });
}

export async function getTenant(id: string): Promise<TenantDetail> {
  return withAdmin(async (q) => {
    const tenantResult = await q<TenantRow>(
      "select id, name, slug, sector, status, created_at from tenants where id = $1",
      [id],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) {
      throw new AppError(404, "not_found", "Tenant not found");
    }

    const usersResult = await q<TenantUserRow>(
      "select id, email, name, role, status from users where tenant_id = $1 order by created_at",
      [id],
    );
    const owner = usersResult.rows.find((user) => user.role === "owner");
    if (!owner) {
      throw new AppError(404, "owner_not_found", "Tenant owner not found");
    }

    return { ...tenant, users: usersResult.rows, owner };
  });
}

export async function setTenantStatus(
  id: string,
  status: TenantStatus,
  adminId: string,
): Promise<TenantRow> {
  return withAdmin(async (q) => {
    const result = await q<TenantRow>(
      `update tenants
       set status = $1
       where id = $2
       returning id, name, slug, sector, status, created_at`,
      [status, id],
    );
    const tenant = result.rows[0];
    if (!tenant) {
      throw new AppError(404, "not_found", "Tenant not found");
    }

    await audit(q, adminId, `tenant.${status}`, id);
    return tenant;
  });
}
