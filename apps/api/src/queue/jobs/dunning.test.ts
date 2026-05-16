import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const mocks = vi.hoisted(() => ({
  withAdmin: vi.fn(),
  emailAdd: vi.fn(),
}));

vi.mock("../../db/withTenant", () => ({
  withAdmin: mocks.withAdmin,
}));

vi.mock("../queues", () => ({
  emailQueue: { add: mocks.emailAdd },
}));

import { dunningProcessor } from "./dunning";
import type { DunningJob } from "../queues";

const withAdminMock = mocks.withAdmin;
const emailAdd = mocks.emailAdd;

type Query = ReturnType<typeof vi.fn>;

function queryFromRows(rows: unknown[]) {
  return vi.fn(async (sql: string) => {
    if (sql.includes("trial_ends_at")) {
      return { rows };
    }
    return { rows: [], rowCount: 1 };
  });
}

describe("dunning processor", () => {
  it("sends trial reminder emails and advances overdue subscriptions", async () => {
    const q: Query = queryFromRows([
      { tenant_id: "tenant-1", email: "owner@example.com", business_name: "BroMart", trial_ends_at: new Date("2026-05-20T00:00:00Z") },
    ]);
    withAdminMock.mockImplementationOnce((fn: (q: Query) => Promise<unknown>) => fn(q));

    await dunningProcessor({ data: {} } as Job<DunningJob>);

    expect(emailAdd).toHaveBeenCalledWith(
      "trial-reminder",
      {
        to: "owner@example.com",
        template: "trial_reminder",
        vars: { businessName: "BroMart", trialEndsAt: "2026-05-20T00:00:00.000Z" },
      },
      { jobId: "trial-reminder:tenant-1:2026-05-20" },
    );
    expect(q).toHaveBeenCalledWith(expect.stringContaining("status='past_due'"));
    expect(q).toHaveBeenCalledWith(expect.stringContaining("status='suspended'"));
  });
});
