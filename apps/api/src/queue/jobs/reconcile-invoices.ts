import type { Job } from "bullmq";

import { withAdmin } from "../../db/withTenant";
import { paymentProviders, type PaymentProvider, type PspProvider } from "../../lib/payments/provider";
import type { ReconcileInvoicesJob } from "../queues";

type InvoiceRow = {
  id: string;
  subscription_id: string;
  psp_provider: PspProvider;
  psp_order_id: string;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
};

type ProviderStatus = {
  status?: "pending" | "paid" | "failed" | "expired" | "refunded" | "unknown";
  transactionId?: string;
  providerInvoiceId?: string;
};

const FAILED_STATUSES = new Set(["failed", "expired"]);

export async function reconcileInvoicesProcessor(_job: Job<ReconcileInvoicesJob>): Promise<void> {
  await reconcileInvoices();
}

export async function reconcileInvoices(): Promise<void> {
  await withAdmin(async (q) => {
    const { rows } = await q<InvoiceRow>(
      `select id, subscription_id, psp_provider, psp_order_id, status
         from invoices
        where status = 'pending'
          and created_at < now() - interval '10 minutes'
        order by created_at asc
        limit 100`,
    );

    for (const invoice of rows) {
      const provider = providerForInvoice(invoice.psp_provider);
      if (!provider?.configured(process.env)) {
        continue;
      }

      const status = (await provider.getStatus(invoice.psp_order_id, process.env)) as ProviderStatus;
      if (status.status === "paid") {
        await q(
          `update invoices
              set status = 'paid',
                  paid_at = coalesce(paid_at, now()),
                  psp_transaction_id = coalesce($1, psp_transaction_id),
                  updated_at = now()
            where psp_provider = $2
              and psp_order_id = $3
              and status = 'pending'`,
          [status.transactionId ?? status.providerInvoiceId ?? null, invoice.psp_provider, invoice.psp_order_id],
        );
        await q(
          `update subscriptions
              set status = 'active',
                  current_period_start = least(current_period_start, now()),
                  current_period_end = greatest(current_period_end, now() + interval '30 days'),
                  updated_at = now()
            where id = $1`,
          [invoice.subscription_id],
        );
      } else if (status.status && FAILED_STATUSES.has(status.status)) {
        await q(
          `update invoices
              set status = $1,
                  updated_at = now()
            where psp_provider = $2
              and psp_order_id = $3
              and status = 'pending'`,
          [status.status, invoice.psp_provider, invoice.psp_order_id],
        );
      }
    }
  });
}

function providerForInvoice(providerName: PspProvider): PaymentProvider | undefined {
  return paymentProviders.find((provider) => provider.name === providerName);
}
