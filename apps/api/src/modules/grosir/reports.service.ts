import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { exportGenerationQueue } from "../../queue/queues";
import { withTenant } from "../../db/withTenant";
import { AppError } from "../../lib/errors";

export type ReportRange = { from: string; to: string };
export type ExportReportType = "sales" | "stock";

export interface SalesReportRow {
  id: string;
  invoice_no: string;
  customer_name: string | null;
  total: number;
  payment_method: string;
  created_at: string;
}

interface SalesReportDbRow extends Omit<SalesReportRow, "total"> {
  total: string | number;
}

export interface StockReportRow {
  product_id: string;
  sku: string;
  name: string;
  stock_qty: number;
  min_stock: number;
}

interface StockReportDbRow extends Omit<StockReportRow, "stock_qty" | "min_stock"> {
  stock_qty: string | number;
  min_stock: string | number;
}

export interface ExportJobRow {
  id: string;
  type: ExportReportType;
  status: "pending" | "processing" | "done" | "failed";
  file_path: string | null;
  created_at: string;
}

interface ExportJobDbRow extends Omit<ExportJobRow, "type" | "status"> {
  type: string;
  status: string;
}

export interface ExportDownload {
  filePath: string;
  filename: string;
}

function normalizeSale(row: SalesReportDbRow): SalesReportRow {
  return { ...row, total: Number(row.total) };
}

function normalizeStock(row: StockReportDbRow): StockReportRow {
  return { ...row, stock_qty: Number(row.stock_qty), min_stock: Number(row.min_stock) };
}

function normalizeExport(row: ExportJobDbRow | undefined): ExportJobRow {
  if (!row) {
    throw new AppError(404, "export_not_found", "Export job not found");
  }
  if (!["sales", "stock"].includes(row.type)) {
    throw new AppError(500, "bad_export_type", "Unsupported export type");
  }
  if (!["pending", "processing", "done", "failed"].includes(row.status)) {
    throw new AppError(500, "bad_export_status", "Unsupported export status");
  }
  return row as ExportJobRow;
}

async function resolveTenantExportPath(tenantId: string, filePath: string): Promise<string> {
  const tenantExportDir = resolve(process.env.EXPORT_DIR ?? "/data/exports", tenantId);
  const resolvedFilePath = resolve(filePath);
  const relativeToTenantDir = relative(tenantExportDir, resolvedFilePath);

  if (relativeToTenantDir.startsWith("..") || isAbsolute(relativeToTenantDir)) {
    throw new AppError(409, "unsafe_export_path", "Export file path is outside the tenant export directory");
  }

  try {
    const canonicalFilePath = await realpath(resolvedFilePath);
    const canonicalRelativeToTenantDir = relative(tenantExportDir, canonicalFilePath);
    if (canonicalRelativeToTenantDir.startsWith("..") || isAbsolute(canonicalRelativeToTenantDir)) {
      throw new AppError(409, "unsafe_export_path", "Export file path is outside the tenant export directory");
    }
    return canonicalFilePath;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(404, "export_file_missing", "Export file is missing");
  }
}

export function salesReport(tenantId: string, range: ReportRange): Promise<{ rows: SalesReportRow[]; grandTotal: number }> {
  return withTenant(tenantId, async (q) => {
    const result = await q<SalesReportDbRow>(
      `select id, invoice_no, customer_name, total, payment_method, created_at
         from sales
        where created_at::date between $1::date and $2::date
        order by created_at desc, invoice_no desc`,
      [range.from, range.to],
    );
    const rows = result.rows.map(normalizeSale);
    return { rows, grandTotal: rows.reduce((sum, row) => sum + row.total, 0) };
  });
}

export function stockReport(tenantId: string, _range?: ReportRange): Promise<StockReportRow[]> {
  return withTenant(tenantId, async (q) => {
    const result = await q<StockReportDbRow>(
      `select id as product_id, sku, name, stock_qty, min_stock
         from products
        where is_active = true
        order by name, sku`,
    );
    return result.rows.map(normalizeStock);
  });
}

export function requestExport(
  tenantId: string,
  userId: string,
  type: ExportReportType,
  params: Record<string, string>,
): Promise<ExportJobRow> {
  return withTenant(tenantId, async (q) => {
    const result = await q<ExportJobDbRow>(
      `insert into export_jobs(tenant_id, type, params, created_by)
       values (current_setting('app.current_tenant_id')::uuid, $1, $2::jsonb, $3)
       returning id, type, status, file_path, created_at`,
      [type, JSON.stringify(params), userId],
    );
    const row = normalizeExport(result.rows[0]);
    await exportGenerationQueue.add("generate", { exportJobId: row.id, tenantId });
    return row;
  });
}

export function listExports(tenantId: string): Promise<ExportJobRow[]> {
  return withTenant(tenantId, async (q) => {
    const result = await q<ExportJobDbRow>(
      `select id, type, status, file_path, created_at
         from export_jobs
        order by created_at desc, id desc
        limit 50`,
    );
    return result.rows.map(normalizeExport);
  });
}

export function getExportDownload(tenantId: string, id: string): Promise<ExportDownload> {
  return withTenant(tenantId, async (q) => {
    const result = await q<{ type: string; status: string; file_path: string | null }>(
      "select type, status, file_path from export_jobs where id = $1",
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, "export_not_found", "Export job not found");
    }
    if (row.status !== "done" || !row.file_path) {
      throw new AppError(409, "export_not_ready", "Export job is not ready for download");
    }
    const safeFilePath = await resolveTenantExportPath(tenantId, row.file_path);
    return { filePath: safeFilePath, filename: `${row.type}-${id}.csv` };
  });
}
