import { afterAll, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

import { adminPool, tenantPool } from "../../db/pool";
import { provisioningProcessor } from "./provisioning";
import type { ProvisioningJob } from "../queues";

const { emailQueueAdd } = vi.hoisted(() => ({
  emailQueueAdd: vi.fn(),
}));

vi.mock("../queues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queues")>();
  return {
    ...actual,
    emailQueue: {
      add: emailQueueAdd,
    },
  };
});

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("provisioning processor", () => {
  afterAll(async () => {
    await Promise.all([adminPool.end(), tenantPool.end()]);
  });

  it("idempotently seeds default categories, units, settings, and welcome email for a grosir tenant", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const tenant = await adminPool.query<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      ["ProvCo", `prov-${suffix}`],
    );
    const tenantId = tenant.rows[0]!.id;
    await adminPool.query(
      "insert into users(tenant_id, email, password_hash, name, role) values ($1, $2, 'hash', 'Owner', 'owner')",
      [tenantId, `owner-${suffix}@provco.test`],
    );

    await provisioningProcessor({ data: { tenantId } } as Job<ProvisioningJob>);
    await provisioningProcessor({ data: { tenantId } } as Job<ProvisioningJob>);

    const categories = await adminPool.query<{ name: string }>(
      "select name from categories where tenant_id = $1 order by name",
      [tenantId],
    );
    const units = await adminPool.query<{ name: string }>("select name from units where tenant_id = $1 order by name", [
      tenantId,
    ]);
    const settings = await adminPool.query<{ settings: { provisioned?: boolean } }>(
      "select settings from tenants where id = $1",
      [tenantId],
    );

    expect(categories.rows.map((row) => row.name)).toEqual([
      "Kebutuhan Rumah",
      "Lainnya",
      "Minuman",
      "Sembako",
      "Snack",
    ]);
    expect(units.rows.map((row) => row.name)).toEqual(["dus", "karton", "kg", "lusin", "pak", "pcs", "sak"]);
    expect(settings.rows[0]!.settings.provisioned).toBe(true);
    expect(emailQueueAdd).toHaveBeenCalledTimes(2);
    expect(emailQueueAdd).toHaveBeenLastCalledWith(
      "send",
      {
        to: `owner-${suffix}@provco.test`,
        template: "welcome",
        vars: { name: "Owner" },
      },
      { jobId: `tenant-welcome-${tenantId}` },
    );
  });
});
