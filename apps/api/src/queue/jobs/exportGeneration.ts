import type { Job } from "bullmq";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { withAdmin } from "../../db/withTenant";
import { createNotification } from "../../modules/grosir/notifications.service";
import { salesReport, stockReport, type ExportReportType } from "../../modules/grosir/reports.service";
import type { ExportGenerationJob } from "../queues";

interface ExportJobRecord {
  type: ExportReportType;
  params: Record<string, string>;
}

const headersByType: Record<ExportReportType, string[]> = {
  sales: ["id", "invoice_no", "customer_name", "total", "payment_method", "created_at"],
  stock: ["product_id", "sku", "name", "stock_qty", "min_stock"],
};

function escapeCsv(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[], headers: string[]): string {
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","))].join("\n");
}

export async function exportProcessor(job: Job<ExportGenerationJob>): Promise<void> {
  const { exportJobId, tenantId } = job.data;
  const jobRow = await withAdmin(async (q) => {
    const result = await q<ExportJobRecord>("select type, params from export_jobs where tenant_id = $1 and id = $2", [
      tenantId,
      exportJobId,
    ]);
    return result.rows[0];
  });
  if (!jobRow) {
    return;
  }

  await withAdmin((q) => q("update export_jobs set status = 'processing' where tenant_id = $1 and id = $2", [tenantId, exportJobId]));

  try {
    const headers = headersByType[jobRow.type];
    const csv =
      jobRow.type === "sales"
        ? toCsv((await salesReport(tenantId, { from: jobRow.params.from, to: jobRow.params.to })).rows as unknown as Record<string, unknown>[], headers)
        : toCsv((await stockReport(tenantId, { from: jobRow.params.from, to: jobRow.params.to })) as unknown as Record<string, unknown>[], headers);
    const dir = join(process.env.EXPORT_DIR ?? "/data/exports", tenantId);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${jobRow.type}-${exportJobId}.csv`);
    writeFileSync(filePath, csv, "utf8");

    await withAdmin((q) =>
      q("update export_jobs set status = 'done', file_path = $3 where tenant_id = $1 and id = $2", [tenantId, exportJobId, filePath]),
    );
    await createNotification(tenantId, {
      type: "export_ready",
      title: "Export selesai",
      body: `Laporan ${jobRow.type} siap diunduh`,
      metadata: { export_job_id: exportJobId, type: jobRow.type },
    });
  } catch (error) {
    await withAdmin((q) => q("update export_jobs set status = 'failed' where tenant_id = $1 and id = $2", [tenantId, exportJobId]));
    throw error;
  }
}
