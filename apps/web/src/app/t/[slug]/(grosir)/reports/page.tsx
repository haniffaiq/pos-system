"use client";

import React, { useMemo, useState } from "react";
import { Badge, Button, Card, Input, Table } from "@app/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession } from "@/lib/auth";
import { formatRupiah } from "@/lib/format";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext } from "@/lib/tenant";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface SalesReport {
  rows: { id?: string; invoice_no: string; customer_name?: string | null; total: number; payment_method: string; created_at: string }[];
  grandTotal: number;
}

interface StockRow {
  product_id: string;
  sku: string;
  name: string;
  stock_qty: number;
  min_stock: number;
}

interface ExportJob {
  id: string;
  type: "sales" | "stock" | string;
  status: "pending" | "processing" | "done" | "failed" | string;
  file_path: string | null;
  created_at: string;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function rangeQuery(from: string, to: string): string {
  const params = new URLSearchParams({ from, to });
  return params.toString();
}

async function downloadExport(job: ExportJob): Promise<void> {
  const session = getSession();
  if (!session?.tenantId || !session.accessToken) throw new Error("no tenant session");

  const headers = new Headers();
  headers.set("authorization", `Bearer ${session.accessToken}`);
  const response = await fetch(
    `${API_BASE}/api/v1/t/${session.tenantId}/m/reports/exports/${job.id}/download`,
    { headers },
  );
  if (!response.ok) throw new Error("download failed");

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${job.type}-${job.id}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(todayDate);
  const [to, setTo] = useState(todayDate);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { data: ctx, isLoading: ctxLoading } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });
  const canRead = ctx?.role === "owner" || ctx?.role === "manager";
  const query = useMemo(() => rangeQuery(from, to), [from, to]);
  const salesKey = ["grosir-reports", "sales", from, to];
  const stockKey = ["grosir-reports", "stock", from, to];
  const exportsKey = ["grosir-reports", "exports"];

  const sales = useQuery({
    queryKey: salesKey,
    queryFn: () => grosirApi<SalesReport>(`/reports/sales?${query}`),
    enabled: canRead,
  });
  const stock = useQuery({
    queryKey: stockKey,
    queryFn: () => grosirApi<StockRow[]>(`/reports/stock?${query}`),
    enabled: canRead,
  });
  const exports = useQuery({
    queryKey: exportsKey,
    queryFn: () => grosirApi<ExportJob[]>("/reports/exports"),
    enabled: canRead,
    refetchInterval: 5000,
  });

  const requestExport = useMutation({
    mutationFn: (type: "sales" | "stock") =>
      grosirApi<ExportJob>("/reports/exports", {
        method: "POST",
        body: JSON.stringify({ type, params: { from, to } }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: exportsKey }),
  });

  if (!ctxLoading && !canRead) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-black">Laporan</h1>
          <p className="mt-1 text-sm text-fg/70">Laporan penjualan, stok, dan export CSV.</p>
        </div>
        <Card>
          <Badge tone="soft">Owner/manager only</Badge>
          <p className="mt-3 text-sm text-fg/70">Akses laporan dibatasi untuk owner dan manager tenant.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black">Laporan</h1>
        <p className="mt-1 text-sm text-fg/70">Pantau penjualan dan stok per rentang tanggal, lalu export CSV saat dibutuhkan.</p>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
          <Input label="Dari" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input label="Sampai" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Button variant="secondary" onClick={() => requestExport.mutate("sales")} disabled={!canRead || requestExport.isPending}>
            Export CSV penjualan
          </Button>
          <Button variant="secondary" onClick={() => requestExport.mutate("stock")} disabled={!canRead || requestExport.isPending}>
            Export CSV stok
          </Button>
        </div>
        <p className="mt-3 text-2xl font-black">Total penjualan: {formatRupiah(sales.data?.grandTotal ?? 0)}</p>
      </Card>

      <Table
        head={
          <tr>
            <th className="p-3">Invoice</th>
            <th className="p-3">Pelanggan</th>
            <th className="p-3">Total</th>
            <th className="p-3">Bayar</th>
            <th className="p-3">Waktu</th>
          </tr>
        }
      >
        {sales.isLoading ? (
          <tr><td className="p-3 text-fg/70" colSpan={5}>Loading…</td></tr>
        ) : null}
        {!sales.isLoading && (sales.data?.rows.length ?? 0) === 0 ? (
          <tr><td className="p-3 text-fg/70" colSpan={5}>Belum ada penjualan pada rentang ini.</td></tr>
        ) : null}
        {(sales.data?.rows ?? []).map((row) => (
          <tr key={row.id ?? row.invoice_no}>
            <td className="p-3 font-bold">{row.invoice_no}</td>
            <td className="p-3">{row.customer_name ?? "—"}</td>
            <td className="p-3">{formatRupiah(row.total)}</td>
            <td className="p-3">{row.payment_method}</td>
            <td className="p-3">{new Date(row.created_at).toLocaleString("id-ID")}</td>
          </tr>
        ))}
      </Table>

      <Card>
        <h2 className="mb-3 text-xl font-black">Laporan stok</h2>
        <Table
          head={
            <tr>
              <th className="p-3">SKU</th>
              <th className="p-3">Nama</th>
              <th className="p-3">Stok</th>
              <th className="p-3">Minimum</th>
            </tr>
          }
        >
          {stock.isLoading ? (
            <tr><td className="p-3 text-fg/70" colSpan={4}>Loading…</td></tr>
          ) : null}
          {!stock.isLoading && (stock.data?.length ?? 0) === 0 ? (
            <tr><td className="p-3 text-fg/70" colSpan={4}>Belum ada stok aktif.</td></tr>
          ) : null}
          {(stock.data ?? []).map((row) => (
            <tr key={row.product_id}>
              <td className="p-3 font-bold">{row.sku}</td>
              <td className="p-3">{row.name}</td>
              <td className="p-3">
                {row.stock_qty} unit
                {row.stock_qty <= row.min_stock && <Badge tone="accent" className="ml-2">menipis</Badge>}
              </td>
              <td className="p-3">{row.min_stock} unit</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black">Riwayat export</h2>
            <p className="text-sm text-fg/70">Status dipoll otomatis; job done bisa diunduh lewat route terautentikasi.</p>
          </div>
          {exports.isFetching && <Badge tone="soft">polling</Badge>}
        </div>
        {downloadError && <p className="mb-3 text-sm font-bold text-accent">{downloadError}</p>}
        <Table
          head={
            <tr>
              <th className="p-3">Tipe</th>
              <th className="p-3">Status</th>
              <th className="p-3">Dibuat</th>
              <th className="p-3">Download</th>
            </tr>
          }
        >
          {exports.isLoading ? (
            <tr><td className="p-3 text-fg/70" colSpan={4}>Loading…</td></tr>
          ) : null}
          {!exports.isLoading && (exports.data?.length ?? 0) === 0 ? (
            <tr><td className="p-3 text-fg/70" colSpan={4}>Belum ada export.</td></tr>
          ) : null}
          {(exports.data ?? []).map((job) => (
            <tr key={job.id}>
              <td className="p-3 font-bold">{job.type}</td>
              <td className="p-3"><Badge tone={job.status === "done" ? "secondary" : job.status === "failed" ? "accent" : "soft"}>{job.status}</Badge></td>
              <td className="p-3">{new Date(job.created_at).toLocaleString("id-ID")}</td>
              <td className="p-3">
                {job.status === "done" ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDownloadError(null);
                      downloadExport(job).catch(() => setDownloadError("Download export gagal."));
                    }}
                  >
                    Download {job.type} export
                  </Button>
                ) : (
                  <span className="text-sm text-fg/70">Menunggu job selesai</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
