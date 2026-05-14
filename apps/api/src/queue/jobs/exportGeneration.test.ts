import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job } from "bullmq";
import { afterAll, describe, expect, it } from "vitest";

import { adminPool, tenantPool } from "../../db/pool";
import { requestExport } from "../../modules/grosir/reports.service";
import { exportProcessor } from "./exportGeneration";
import type { ExportGenerationJob } from "../queues";

const databaseUrl = process.env.DATABASE_URL;
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL;
const describeWithDatabase = databaseUrl && databaseAdminUrl ? describe : describe.skip;

async function createExportFixture(): Promise<{ tenantId: string; userId: string }> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenant = await adminPool.query<{ id: string }>(
    "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
    [`Export ${suffix}`, `export-${suffix}`],
  );
  const tenantId = tenant.rows[0]!.id;
  const user = await adminPool.query<{ id: string }>(
    "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'h', 'Owner', 'owner') returning id",
    [tenantId, `owner-${suffix}@export.test`],
  );
  return { tenantId, userId: user.rows[0]!.id };
}

describeWithDatabase("export generation processor", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("writes a CSV file, marks the export done, and notifies the tenant", async () => {
    process.env.EXPORT_DIR = mkdtempSync(join(tmpdir(), "exports-"));
    const fixture = await createExportFixture();
    const exportJob = await requestExport(fixture.tenantId, fixture.userId, "sales", { from: "2000-01-01", to: "2999-01-01" });

    await exportProcessor({ data: { exportJobId: exportJob.id, tenantId: fixture.tenantId } } as Job<ExportGenerationJob>);

    const stored = await adminPool.query<{
      status: string;
      file_path: string;
      notifications: string;
    }>(
      `select e.status, e.file_path, count(n.id) as notifications
         from export_jobs e
         left join notifications n on n.tenant_id = e.tenant_id and n.type = 'export_ready'
        where e.id = $1
        group by e.status, e.file_path`,
      [exportJob.id],
    );
    expect(stored.rows[0]).toMatchObject({ status: "done", notifications: "1" });
    expect(existsSync(stored.rows[0]!.file_path)).toBe(true);
    expect(readFileSync(stored.rows[0]!.file_path, "utf8")).toContain("invoice_no");
  });
});
