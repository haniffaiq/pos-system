import { Hono } from "hono";

import { withAdmin, type Query } from "../db/withTenant";
import { logger } from "../lib/logger";
import { getXenditConfig, mapXenditStatus, verifyXenditWebhook } from "../lib/payments/xendit";
import { mapMidtransStatus, verifyMidtransSignature, type MidtransStatusPayload } from "../lib/payments/midtrans";

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
  serverKey?: string;
};

type ProcessResult =
  | { ok: false; reason: "signature" }
  | { ok: true; reason: "missing_order_id" | "unknown_order" | "ignored" | "already_paid" | "updated"; status?: string };

const FINAL_FAILURE_STATUSES = new Set(["failed", "expired"]);

function shouldUsePaidTransition(currentStatus: InvoiceRow["status"], nextStatus: string): boolean {
  return nextStatus === "paid" && (currentStatus === "pending" || currentStatus === "failed");
}

function shouldUseFailureTransition(currentStatus: InvoiceRow["status"], nextStatus: string): boolean {
  return currentStatus === "pending" && FINAL_FAILURE_STATUSES.has(nextStatus);
}

export async function processMidtransWebhook(
  payload: MidtransStatusPayload,
  q: Query,
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  const serverKey = options.serverKey ?? process.env.MIDTRANS_SERVER_KEY;
  const signaturePayload = {
    order_id: typeof payload.order_id === "string" ? payload.order_id : "",
    status_code: typeof payload.status_code === "string" ? payload.status_code : "",
    gross_amount: typeof payload.gross_amount === "string" ? payload.gross_amount : "",
    signature_key: typeof payload.signature_key === "string" ? payload.signature_key : "",
  };

  if (!serverKey || !verifyMidtransSignature(signaturePayload, serverKey)) {
    return { ok: false, reason: "signature" };
  }

  const orderId = signaturePayload.order_id.trim();
  if (!orderId) {
    return { ok: true, reason: "missing_order_id" };
  }

  const invoiceResult = await q<InvoiceRow>(
    `select id, tenant_id, subscription_id, status
       from invoices
      where psp_provider = 'midtrans'
        and psp_order_id = $1
      for update`,
    [orderId],
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) {
    return { ok: true, reason: "unknown_order" };
  }

  const status = mapMidtransStatus(payload.transaction_status);

  if (invoice.status === "paid") {
    return { ok: true, reason: "already_paid", status: "paid" };
  }

  if (shouldUsePaidTransition(invoice.status, status)) {
    await q(
      `update invoices
          set status = 'paid',
              paid_at = now(),
              psp_transaction_id = coalesce($1, psp_transaction_id),
              updated_at = now()
        where psp_provider = 'midtrans'
          and psp_order_id = $2
          and status in ('pending', 'failed')`,
      [payload.transaction_id ?? null, orderId],
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

  if (shouldUseFailureTransition(invoice.status, status)) {
    await q(
      `update invoices
          set status = $1,
              psp_transaction_id = coalesce($2, psp_transaction_id),
              updated_at = now()
        where psp_provider = 'midtrans'
          and psp_order_id = $3
          and status = 'pending'`,
      [status, payload.transaction_id ?? null, orderId],
    );
    return { ok: true, reason: "updated", status };
  }

  return { ok: true, reason: "ignored", status };
}

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

export const billingWebhookRouter = new Hono()
  .post("/midtrans/webhook", async (c) => {
    const payload = (await c.req.json()) as MidtransStatusPayload;
    const out = await withAdmin((q) => processMidtransWebhook(payload, q));

    if (!out.ok) {
      logger.warn({ orderId: payload.order_id, reason: out.reason }, "midtrans webhook");
      return c.json({ received: false, reason: out.reason }, 401);
    }

    if (out.reason === "unknown_order" || out.reason === "missing_order_id") {
      logger.warn({ orderId: payload.order_id, reason: out.reason }, "midtrans webhook");
    }

    return c.json({ received: true });
  })
  .post("/xendit/webhook", async (c) => {
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
