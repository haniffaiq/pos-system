import type { Job } from "bullmq";

import { withAdmin } from "../../db/withTenant";
import { emailQueue, type ProvisioningJob } from "../queues";

const DEFAULT_CATEGORIES = ["Sembako", "Minuman", "Snack", "Kebutuhan Rumah", "Lainnya"] as const;
const DEFAULT_UNITS = ["pcs", "pak", "lusin", "dus", "karton", "sak", "kg"] as const;

type ProvisioningProcessorJob = Pick<Job<ProvisioningJob>, "data">;

type TenantProvisioningRow = {
  id: string;
  sector: string;
};

type OwnerRow = {
  email: string;
  name: string;
};

export async function provisioningProcessor(job: ProvisioningProcessorJob): Promise<void> {
  const { tenantId } = job.data;

  const owner = await withAdmin(async (q) => {
    const tenant = await q<TenantProvisioningRow>("select id, sector from tenants where id = $1", [tenantId]);
    const tenantRow = tenant.rows[0];
    if (!tenantRow) {
      return undefined;
    }

    if (tenantRow.sector === "grosir") {
      for (const name of DEFAULT_CATEGORIES) {
        await q("insert into categories(tenant_id, name) values ($1, $2) on conflict do nothing", [tenantId, name]);
      }

      for (const name of DEFAULT_UNITS) {
        await q("insert into units(tenant_id, name) values ($1, $2) on conflict do nothing", [tenantId, name]);
      }
    }

    await q("update tenants set settings = settings || $2::jsonb where id = $1", [
      tenantId,
      JSON.stringify({ provisioned: true }),
    ]);

    const ownerResult = await q<OwnerRow>(
      "select email, name from users where tenant_id = $1 and role = 'owner' limit 1",
      [tenantId],
    );
    return ownerResult.rows[0];
  });

  if (owner) {
    await emailQueue.add(
      "send",
      {
        to: owner.email,
        template: "welcome",
        vars: { name: owner.name },
      },
      { jobId: `tenant-welcome-${tenantId}` },
    );
  }
}
