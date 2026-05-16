"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card } from "@app/ui";
import { apiFetch } from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext, tenantContextKey, tenantQueryKey } from "@/lib/tenant";

interface BillingSummary {
  plan: { quota?: Record<string, number | null | undefined> } | null;
  usage?: Record<string, number | null | undefined>;
}

interface Dashboard {
  todaySalesTotal: number;
  todayTxnCount: number;
  lowStockCount: number;
  topProducts: { product_id: string; name: string; qty_sold: number }[];
}

const metricLabels: Record<string, string> = {
  users: "Pengguna",
  skus: "Produk (SKU)",
  tx_per_month: "Transaksi / bulan",
  tx_count: "Transaksi / bulan",
  export_count: "Ekspor laporan",
  exports: "Ekspor laporan",
  outlets: "Outlet",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function quotaRows(summary?: BillingSummary) {
  const quota = summary?.plan?.quota ?? {};
  const usage = summary?.usage ?? {};
  return Object.entries(quota).flatMap(([metric, limit]) => {
    if (typeof limit !== "number" || !Number.isFinite(limit)) return [];
    const current = typeof usage[metric] === "number" && Number.isFinite(usage[metric]) ? usage[metric] : 0;
    return [{ metric, label: metricLabels[metric] ?? metric, current, limit }];
  });
}

function QuotaUsageBars({ summary }: { summary?: BillingSummary }) {
  const rows = quotaRows(summary);
  if (rows.length === 0) return null;

  return (
    <Card>
      <h2 className="mb-3 text-xl font-black">Penggunaan kuota</h2>
      <div className="space-y-4">
        {rows.map((row) => {
          const pct = row.limit > 0 ? Math.min(100, Math.round((row.current / row.limit) * 100)) : 0;
          return (
            <div key={row.metric} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm font-black">
                <span>{row.label}</span>
                <span>
                  {formatNumber(row.current)} / {formatNumber(row.limit)}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full border-2 border-fg bg-bg" aria-label={`${row.label} ${pct}%`}>
                <div className="h-full bg-fg" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function GrosirDashboard({ role, tenantId }: { role: string; tenantId: string }) {
  const {
    data,
    isError,
    isLoading,
  } = useQuery({ queryKey: tenantQueryKey(tenantId, "/dashboard"), queryFn: () => grosirApi<Dashboard>("/dashboard") });
  const { data: billingSummary } = useQuery({ queryKey: tenantQueryKey(tenantId, "/billing/summary"), queryFn: () => apiFetch<BillingSummary>("/billing/summary") });

  if (isLoading) return <p className="text-fg/70">Loading…</p>;

  if (isError || !data) {
    return (
      <Card className="max-w-lg">
        <h1 className="mb-2 text-3xl font-black">Dashboard belum bisa dimuat.</h1>
        <p className="text-fg/70">Coba muat ulang halaman atau periksa koneksi API grosir.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-3xl font-black">Dashboard</h1>
        {role === "cashier" ? (
          <p className="text-fg/70 font-bold">Cashier dapat melihat ringkasan penjualan tanpa akses laporan lanjutan.</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
        <Card hover>
          <p className="font-bold text-fg/70">Penjualan hari ini</p>
          <p className="text-4xl font-black">{formatRupiah(data.todaySalesTotal)}</p>
        </Card>
        <Card hover>
          <p className="font-bold text-fg/70">Transaksi hari ini</p>
          <p className="text-4xl font-black">{data.todayTxnCount}</p>
        </Card>
        <Card hover>
          <p className="font-bold text-fg/70">Produk stok menipis</p>
          <p className="text-4xl font-black">{data.lowStockCount}</p>
        </Card>
      </div>

      <QuotaUsageBars summary={billingSummary} />

      <Card>
        <h2 className="mb-3 text-xl font-black">Produk terlaris (30 hari)</h2>
        {data.topProducts.length > 0 ? (
          <ul className="space-y-1">
            {data.topProducts.map((product) => (
              <li key={product.product_id} className="font-bold">
                ✦ {product.name} — {product.qty_sold}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-fg/70">Belum ada produk terlaris.</p>
        )}
      </Card>
    </div>
  );
}

export default function TenantDashboard({ params }: { params: { slug: string } }) {
  const { data: ctx } = useQuery({ queryKey: tenantContextKey(params.slug), queryFn: () => fetchTenantContext(params.slug) });

  if (!ctx) return <p className="text-fg/70">Loading…</p>;

  if (ctx.sector === "grosir") return <GrosirDashboard role={ctx.role} tenantId={ctx.tenantId} />;

  return (
    <Card className="max-w-lg">
      <h1 className="mb-2 text-3xl font-black">Module coming soon</h1>
      <p className="text-fg/70">
        The <Badge tone="soft">{ctx.sector}</Badge> module is not available yet.
      </p>
    </Card>
  );
}
