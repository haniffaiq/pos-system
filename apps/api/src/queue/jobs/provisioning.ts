import type { Job } from "bullmq";

import { withAdmin } from "../../db/withTenant";
import { emailQueue, type ProvisioningJob } from "../queues";

const DEFAULT_CATEGORIES = ["Sembako", "Minuman", "Snack", "Kebutuhan Rumah", "Lainnya"] as const;
const DEFAULT_UNITS = ["pcs", "pak", "lusin", "dus", "karton", "sak", "kg"] as const;

type ProvisioningProcessorJob = Pick<Job<ProvisioningJob>, "data">;

export async function provisioningProcessor(job: ProvisioningProcessorJob): Promise<void> {
  const { tenantId } = job.data;

  await withAdmin(async (q) => {
    for (const name of DEFAULT_CATEGORIES) {
      await q("insert into categories(tenant_id, name) values ($1, $2) on conflict do nothing", [tenantId, name]);
    }

    for (const name of DEFAULT_UNITS) {
      await q("insert into units(tenant_id, name) values ($1, $2) on conflict do nothing", [tenantId, name]);
    }

    await q("update tenants set settings = settings || '{\"provisioned\": true}' where id = $1", [tenantId]);

    const owner = await q<{ email: string; name: string }>(
      "select email, name from users where tenant_id = $1 and role = 'owner' limit 1",
      [tenantId],
    );

    if (owner.rowCount) {
      await emailQueue.add("welcome", {
        to: owner.rows[0].email,
        template: "welcome",
        vars: { name: owner.rows[0].name },
      });
    }
  });
}
