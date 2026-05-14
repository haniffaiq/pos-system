"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card } from "@app/ui";
import { formatRupiah } from "@/lib/format";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext } from "@/lib/tenant";

interface Dashboard {
  todaySalesTotal: number;
  todayTxnCount: number;
  lowStockCount: number;
  topProducts: { product_id: string; name: string; qty_sold: number }[];
}

function GrosirDashboard({ role }: { role: string }) {
  const {
    data,
    isError,
    isLoading,
  } = useQuery({ queryKey: ["/dashboard"], queryFn: () => grosirApi<Dashboard>("/dashboard") });

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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
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

export default function TenantDashboard() {
  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });

  if (!ctx) return <p className="text-fg/70">Loading…</p>;

  if (ctx.sector === "grosir") return <GrosirDashboard role={ctx.role} />;

  return (
    <Card className="max-w-lg">
      <h1 className="mb-2 text-3xl font-black">Module coming soon</h1>
      <p className="text-fg/70">
        The <Badge tone="soft">{ctx.sector}</Badge> module is not available yet.
      </p>
    </Card>
  );
}
