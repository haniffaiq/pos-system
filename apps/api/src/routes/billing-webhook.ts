import { Hono } from "hono";

import { withAdmin, type Query } from "../db/withTenant";
import { logger } from "../lib/logger";
import { getXenditConfig, mapXenditStatus, verifyXenditWebhook } from "../lib/payments/xendit";

type XenditWebhookPayload = {
  id?: string;
  external_id?: string;
  status?: string;
  payment_method?: string;
};

type HeaderLike = Headers | Record<string, string | string[] | undefined>;

type InvoiceRow = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
};

type ProcessOptions = {
  webhookToken?: string;
};

type ProcessResult =
  | { ok: false; reason: "signature" }
  | { ok: true; reason: "missing_order_id" | "unknown_order" | "ignored" | "already_paid" | "updated"; status?: string };

const FINAL_FAILURE_STATUSES = new Set(["failed", "expired"]);

export async function processXenditWebhook(
  payload: XenditWebhookPayload,
  headers: HeaderLike,
  q: Query,
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  const webhookToken = options.webhookToken ?? getXenditConfig().webhookToken;
  if (!verifyXenditWebhook(headers, webhookToken)) {
    return { ok: false, reason: "signature" };
  }

  const orderId = payload.external_id?.trim();
  if (!orderId) {
    return { ok: true, reason: "missing_order_id" };
  }

  const invoiceResult = await q<InvoiceRow>(
    `select id, tenant_id, subscription_id, status
       from invoices
      where psp_provider = 'xendit'
        and psp_order_id = $1
      for update`,
    [orderId],
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) {
    return { ok: true, reason: "unknown_order" };
  }

  const status = mapXenditStatus(payload.status);

  if (invoice.status === "paid") {
    return { ok: true, reason: "already_paid", status: "paid" };
  }

  if (status === "paid") {
    await q(
      `update invoices
          set status = 'paid',
              paid_at = now(),
              psp_transaction_id = coalesce($1, psp_transaction_id),
              payment_method = coalesce($2, payment_method),
              updated_at = now()
        where psp_provider = 'xendit'
          and psp_order_id = $3
          and status in ('pending', 'failed')`,
      [payload.id ?? null, payload.payment_method ?? null, orderId],
    );
    await q(
      `update subscriptions
          set status = 'active',
              current_period_start = now(),
              current_period_end = now() + interval '30 days',
              updated_at = now()
        where id = $1`,
      [invoice.subscription_id],
    );
    return { ok: true, reason: "updated", status: "paid" };
  }

  if (invoice.status === "pending" && FINAL_FAILURE_STATUSES.has(status)) {
    await q(
      `update invoices
          set status = $1,
              psp_transaction_id = coalesce($2, psp_transaction_id),
              payment_method = coalesce($3, payment_method),
              updated_at = now()
        where psp_provider = 'xendit'
          and psp_order_id = $4
          and status = 'pending'`,
      [status, payload.id ?? null, payload.payment_method ?? null, orderId],
    );
    return { ok: true, reason: "updated", status };
  }

  return { ok: true, reason: "ignored", status };
}

export const billingWebhookRouter = new Hono().post("/xendit/webhook", async (c) => {
  const payload = (await c.req.json()) as XenditWebhookPayload;
  const out = await withAdmin((q) => processXenditWebhook(payload, c.req.raw.headers, q));

  if (!out.ok) {
    logger.warn({ orderId: payload.external_id, reason: out.reason }, "xendit webhook");
    return c.json({ received: false, reason: out.reason }, 401);
  }

  if (out.reason === "unknown_order" || out.reason === "missing_order_id") {
    logger.warn({ orderId: payload.external_id, reason: out.reason }, "xendit webhook");
  }

  return c.json({ received: true });
});
