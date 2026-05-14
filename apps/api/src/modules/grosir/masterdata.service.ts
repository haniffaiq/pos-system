import type { CategoryInput, SupplierInput, UnitInput } from "@app/shared";

import { withTenant } from "../../db/withTenant";
import { AppError } from "../../lib/errors";

export interface NamedRow {
  id: string;
  name: string;
}

export interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
}

type MasterDataKind = "category" | "unit" | "supplier";

function notFound(kind: MasterDataKind): AppError {
  return new AppError(404, `${kind}_not_found`, `${kind} not found`);
}

function requireRow<T>(row: T | undefined, kind: MasterDataKind): T {
  if (!row) {
    throw notFound(kind);
  }
  return row;
}

export function listCategories(tenantId: string): Promise<NamedRow[]> {
  return withTenant(tenantId, async (q) => (await q<NamedRow>("select id, name from categories order by name")).rows);
}

export function createCategory(tenantId: string, input: CategoryInput): Promise<NamedRow> {
  return withTenant(tenantId, async (q) => {
    const result = await q<NamedRow>(
      "insert into categories(tenant_id, name) values (current_setting('app.current_tenant_id')::uuid, $1) returning id, name",
      [input.name],
    );
    return requireRow(result.rows[0], "category");
  });
}

export function updateCategory(tenantId: string, id: string, input: CategoryInput): Promise<NamedRow> {
  return withTenant(tenantId, async (q) => {
    const result = await q<NamedRow>("update categories set name = $2 where id = $1 returning id, name", [id, input.name]);
    return requireRow(result.rows[0], "category");
  });
}

export function deleteCategory(tenantId: string, id: string): Promise<void> {
  return withTenant(tenantId, async (q) => {
    const result = await q<NamedRow>("delete from categories where id = $1 returning id, name", [id]);
    requireRow(result.rows[0], "category");
  });
}

export function listUnits(tenantId: string): Promise<NamedRow[]> {
  return withTenant(tenantId, async (q) => (await q<NamedRow>("select id, name from units order by name")).rows);
}

export function createUnit(tenantId: string, input: UnitInput): Promise<NamedRow> {
  return withTenant(tenantId, async (q) => {
    const result = await q<NamedRow>(
      "insert into units(tenant_id, name) values (current_setting('app.current_tenant_id')::uuid, $1) returning id, name",
      [input.name],
    );
    return requireRow(result.rows[0], "unit");
  });
}

export function updateUnit(tenantId: string, id: string, input: UnitInput): Promise<NamedRow> {
  return withTenant(tenantId, async (q) => {
    const result = await q<NamedRow>("update units set name = $2 where id = $1 returning id, name", [id, input.name]);
    return requireRow(result.rows[0], "unit");
  });
}

export function deleteUnit(tenantId: string, id: string): Promise<void> {
  return withTenant(tenantId, async (q) => {
    const result = await q<NamedRow>("delete from units where id = $1 returning id, name", [id]);
    requireRow(result.rows[0], "unit");
  });
}

export function listSuppliers(tenantId: string): Promise<SupplierRow[]> {
  return withTenant(
    tenantId,
    async (q) => (await q<SupplierRow>("select id, name, phone, address from suppliers order by name")).rows,
  );
}

export function createSupplier(tenantId: string, input: SupplierInput): Promise<SupplierRow> {
  return withTenant(tenantId, async (q) => {
    const result = await q<SupplierRow>(
      `insert into suppliers(tenant_id, name, phone, address)
       values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3)
       returning id, name, phone, address`,
      [input.name, input.phone ?? null, input.address ?? null],
    );
    return requireRow(result.rows[0], "supplier");
  });
}

export function updateSupplier(tenantId: string, id: string, input: SupplierInput): Promise<SupplierRow> {
  return withTenant(tenantId, async (q) => {
    const result = await q<SupplierRow>(
      `update suppliers
       set name = $2, phone = $3, address = $4
       where id = $1
       returning id, name, phone, address`,
      [id, input.name, input.phone ?? null, input.address ?? null],
    );
    return requireRow(result.rows[0], "supplier");
  });
}

export function deleteSupplier(tenantId: string, id: string): Promise<void> {
  return withTenant(tenantId, async (q) => {
    const result = await q<SupplierRow>("delete from suppliers where id = $1 returning id, name, phone, address", [id]);
    requireRow(result.rows[0], "supplier");
  });
}
