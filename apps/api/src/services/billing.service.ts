import { randomUUID } from "node:crypto";

import { AppError } from "../lib/errors";
import { resolvePaymentProvider } from "../lib/payments/provider";
import { withAdmin } from "../db/withTenant";

export type BillingSummary = {
  plan: { code: string; name: string; priceIdr: number; quota: Record<string, unknown> } | null;
  subscription: { status: string; currentPeriodEnd: string } | null;
  invoices: Array<{ id: string; amountIdr: number; status: string; pspProvider: string; createdAt: string }>;
};

type CheckoutInput = {
  tenantId: string;
  userId: string;
  planCode: "pro" | "business";
};

type PlanRow = { id: string; code: string; name: string; price_idr: string; quota: Record<string, unknown> };
type SubscriptionRow = { id: string; status: string; current_period_end: Date };
type InvoiceRow = { id: string; amount_idr: string; status: string; psp_provider: string; created_at: Date };

export async function getBillingSummary(tenantId: string): Promise<BillingSummary> {
  return withAdmin(async (q) => {
    const subscription = await q<PlanRow & SubscriptionRow>(
      `select s.id, s.status, s.current_period_end, p.code, p.name, p.price_idr, p.quota
         from subscriptions s
         join plans p on p.id = s.plan_id
        where s.tenant_id = $1
        order by s.created_at desc
        limit 1`,
      [tenantId],
    );
    const invoices = await q<InvoiceRow>(
      `select id, amount_idr, status, psp_provider, created_at
         from invoices
        where tenant_id = $1
        order by created_at desc
        limit 12`,
      [tenantId],
    );
    const current = subscription.rows[0];

    return {
      plan: current
        ? { code: current.code, name: current.name, priceIdr: Number(current.price_idr), quota: current.quota }
        : null,
      subscription: current ? { status: current.status, currentPeriodEnd: current.current_period_end.toISOString() } : null,
      invoices: invoices.rows.map((invoice) => ({
        id: invoice.id,
        amountIdr: Number(invoice.amount_idr),
        status: invoice.status,
        pspProvider: invoice.psp_provider,
        createdAt: invoice.created_at.toISOString(),
      })),
    };
  });
}

export async function createBillingCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; provider: string }> {
  const plan = await withAdmin(async (q) => {
    const result = await q<PlanRow>("select id, code, name, price_idr, quota from plans where code = $1 and is_active = true", [
      input.planCode,
    ]);
    return result.rows[0];
  });
  if (!plan) throw new AppError(404, "plan_not_found", "Plan is not available");

  const amountIdr = Number(plan.price_idr);
  if (amountIdr <= 0) throw new AppError(400, "invalid_plan", "Selected plan does not require checkout");

  const resolution = resolvePaymentProvider();
  const orderId = `BILL-${input.tenantId.slice(0, 8)}-${randomUUID()}`;
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await withAdmin(async (q) => {
    const subscription = await q<{ id: string }>(
      `insert into subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
       values ($1, $2, 'trialing', now(), $3)
       returning id`,
      [input.tenantId, plan.id, periodEnd],
    );
    await q(
      `insert into invoices (tenant_id, subscription_id, amount_idr, status, psp_provider, psp_order_id, due_at)
       values ($1, $2, $3, 'pending', $4, $5, $6)`,
      [input.tenantId, subscription.rows[0]!.id, amountIdr, resolution.effectivePsp, orderId, dueAt],
    );
  });

  const checkout = await resolution.provider.createCheckout({
    orderId,
    amountIdr,
    customerEmail: `${input.userId}@billing.local`,
    description: `BroSolution ${plan.name} plan`,
  });

  return { redirectUrl: checkout.redirectUrl, provider: checkout.provider };
}
