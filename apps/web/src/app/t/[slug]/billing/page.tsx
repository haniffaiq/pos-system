"use client";

import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Table } from "@app/ui";
import { fetchTenantContext, tenantContextKey, tenantQueryKey } from "@/lib/tenant";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type BillingSummary = {
  plan: { code: string; name: string; priceIdr: number; quota: Record<string, unknown> } | null;
  subscription: { status: string; currentPeriodEnd: string } | null;
  invoices: Array<{ id: string; amountIdr: number; status: string; pspProvider: string; createdAt: string }>;
};

type CheckoutResponse = { redirectUrl: string; provider?: string };

async function billingFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${API_BASE}/api/v1/billing${path}`, { ...init, headers, credentials: "include" });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Billing request failed");
  return body as T;
}

function formatIdr(amount: number): string {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function quotaEntries(quota: Record<string, unknown>): string[] {
  return Object.entries(quota).map(([key, value]) => `${key}: ${String(value)}`);
}

export default function BillingPage({ params }: { params: { slug: string } }) {
  const t = useTranslations("billing");
  const { data: ctx } = useQuery({ queryKey: tenantContextKey(params.slug), queryFn: () => fetchTenantContext(params.slug) });
  const { data, isLoading, isError, error } = useQuery({
    queryKey: tenantQueryKey(ctx?.tenantId, "billing", "summary"),
    queryFn: () => billingFetch<BillingSummary>("/summary"),
    enabled: Boolean(ctx?.tenantId),
  });
  const checkout = useMutation({
    mutationFn: (plan: "pro" | "business") =>
      billingFetch<CheckoutResponse>("/checkout", { method: "POST", body: JSON.stringify({ plan }) }),
    onSuccess: (result) => window.location.assign(result.redirectUrl),
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">Billing</p>
        <h1 className="font-display text-3xl font-black text-fg">{t("title")}</h1>
      </div>

      {isLoading ? <p className="font-bold text-fg/70">{t("loading")}</p> : null}
      {isError ? <p className="font-bold text-accent">{error instanceof Error ? error.message : t("loadError")}</p> : null}
      {checkout.isError ? <p className="font-bold text-accent">{checkout.error.message}</p> : null}

      {data ? (
        <>
          <Card hover>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">{t("currentPlan")}</p>
                <h2 className="mt-1 font-display text-2xl font-black">{data.plan?.name ?? t("noPlan")}</h2>
                <p className="mt-2 text-sm font-bold text-fg/70">{t("status", { status: data.subscription?.status ?? t("none") })}</p>
                {data.subscription?.currentPeriodEnd ? (
                  <p className="text-sm font-bold text-fg/70">
                    {t("renews", { date: new Date(data.subscription.currentPeriodEnd).toLocaleDateString("id-ID") })}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button data-plan="pro" variant="primary" disabled={checkout.isPending} onClick={() => checkout.mutate("pro")}>
                  {t("upgradePro")}
                </Button>
                <Button data-plan="business" variant="white" disabled={checkout.isPending} onClick={() => checkout.mutate("business")}>
                  {t("upgradeBusiness")}
                </Button>
              </div>
            </div>
            {data.plan?.quota ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {quotaEntries(data.plan.quota).map((quota) => (
                  <Badge key={quota} tone="soft">
                    {quota}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="p-0">
            <div className="border-b-2 border-fg p-4">
              <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">{t("invoiceHistory")}</p>
              <h2 className="font-display text-2xl font-black">{t("latestInvoices")}</h2>
            </div>
            <Table
              head={
                <tr>
                  <th className="p-3">{t("date")}</th>
                  <th className="p-3">{t("amount")}</th>
                  <th className="p-3">{t("invoiceStatus")}</th>
                  <th className="p-3">PSP</th>
                </tr>
              }
            >
              {data.invoices.length === 0 ? (
                <tr>
                  <td className="p-4 text-center font-bold text-fg/70" colSpan={4}>
                    {t("noInvoices")}
                  </td>
                </tr>
              ) : (
                data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="p-3">{new Date(invoice.createdAt).toLocaleDateString("id-ID")}</td>
                    <td className="p-3 font-bold">{formatIdr(invoice.amountIdr)}</td>
                    <td className="p-3">{invoice.status}</td>
                    <td className="p-3">{invoice.pspProvider}</td>
                  </tr>
                ))
              )}
            </Table>
          </Card>
        </>
      ) : null}
    </div>
  );
}
