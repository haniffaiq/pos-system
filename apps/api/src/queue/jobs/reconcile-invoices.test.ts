import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const mocks = vi.hoisted(() => ({
  withAdmin: vi.fn(),
  midtransGetStatus: vi.fn(),
  xenditGetStatus: vi.fn(),
}));

vi.mock("../../db/withTenant", () => ({
  withAdmin: mocks.withAdmin,
}));

vi.mock("../../lib/payments/provider", () => ({
  paymentProviders: [
    {
      name: "midtrans",
      configured: () => true,
      getStatus: mocks.midtransGetStatus,
    },
    {
      name: "xendit",
      configured: () => true,
      getStatus: mocks.xenditGetStatus,
    },
  ],
}));

import { reconcileInvoicesProcessor } from "./reconcile-invoices";
import type { ReconcileInvoicesJob } from "../queues";

const withAdminMock = mocks.withAdmin;
const midtransGetStatus = mocks.midtransGetStatus;
const xenditGetStatus = mocks.xenditGetStatus;

type QueryResultRow = { rows: unknown[]; rowCount?: number };

function queryFromResponses(responses: QueryResultRow[]) {
  return vi.fn(async () => responses.shift() ?? { rows: [], rowCount: 0 });
}

describe("reconcile invoice processor", () => {
  it("queries invoice status through the invoice PSP and activates subscriptions when paid", async () => {
    midtransGetStatus.mockResolvedValueOnce({ provider: "midtrans", orderId: "mid-1", status: "paid", transactionId: "txn-1" });
    const q = queryFromResponses([
      {
        rows: [
          {
            id: "inv-1",
            subscription_id: "sub-1",
            psp_provider: "midtrans",
            psp_order_id: "mid-1",
            status: "pending",
          },
        ],
      },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    withAdminMock.mockImplementationOnce((fn: (q: typeof q) => Promise<unknown>) => fn(q));

    await reconcileInvoicesProcessor({ data: {} } as Job<ReconcileInvoicesJob>);

    expect(midtransGetStatus).toHaveBeenCalledWith("mid-1", process.env);
    expect(q).toHaveBeenNthCalledWith(2, expect.stringContaining("set status = 'paid'"), ["txn-1", "midtrans", "mid-1"]);
    expect(q).toHaveBeenNthCalledWith(3, expect.stringContaining("set status = 'active'"), ["sub-1"]);
  });

  it("is provider-neutral across Midtrans and Xendit pending invoices", async () => {
    midtransGetStatus.mockResolvedValueOnce({ provider: "midtrans", orderId: "mid-1", status: "pending" });
    xenditGetStatus.mockResolvedValueOnce({ provider: "xendit", orderId: "xen-1", status: "expired" });
    const q = queryFromResponses([
      {
        rows: [
          { id: "inv-1", subscription_id: "sub-1", psp_provider: "midtrans", psp_order_id: "mid-1", status: "pending" },
          { id: "inv-2", subscription_id: "sub-2", psp_provider: "xendit", psp_order_id: "xen-1", status: "pending" },
        ],
      },
      { rows: [], rowCount: 1 },
    ]);
    withAdminMock.mockImplementationOnce((fn: (q: typeof q) => Promise<unknown>) => fn(q));

    await reconcileInvoicesProcessor({ data: {} } as Job<ReconcileInvoicesJob>);

    expect(midtransGetStatus).toHaveBeenCalledWith("mid-1", process.env);
    expect(xenditGetStatus).toHaveBeenCalledWith("xen-1", process.env);
    expect(q).toHaveBeenLastCalledWith(expect.stringContaining("set status = $1"), ["expired", "xendit", "xen-1"]);
  });
});
