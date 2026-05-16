"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

type QuotaExceededDetail = {
  metric?: string;
  current?: number;
  limit?: number;
  upgrade_url?: string;
};

const metricLabels: Record<string, string> = {
  users: "Pengguna",
  skus: "Produk (SKU)",
  tx_per_month: "Transaksi / bulan",
  exports: "Ekspor laporan",
  outlets: "Outlet",
};

function metricLabel(metric?: string): string {
  if (!metric) return "Kuota";
  return metricLabels[metric] ?? metric;
}

function numberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("id-ID").format(value) : "-";
}

export function QuotaModal() {
  const [data, setData] = useState<QuotaExceededDetail | null>(null);

  useEffect(() => {
    const handler = (event: Event) => setData((event as CustomEvent<QuotaExceededDetail>).detail);
    window.addEventListener("quota-exceeded", handler);
    return () => window.removeEventListener("quota-exceeded", handler);
  }, []);

  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="quota-modal-title">
      <div className="w-full max-w-md rounded-lg border-2 border-fg bg-bg p-6 text-fg shadow-brutal-lg">
        <p className="font-display text-sm font-black uppercase tracking-wide text-fg/70">Batas paket</p>
        <h2 id="quota-modal-title" className="mt-1 font-display text-2xl font-black">
          Kuota tercapai
        </h2>
        <p className="mt-3 text-sm font-bold text-fg/80">
          {metricLabel(data.metric)} sudah memakai {numberText(data.current)} / {numberText(data.limit)}. Upgrade paket untuk melanjutkan operasi ini.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={data.upgrade_url ?? "/billing"} className="rounded-md border-2 border-fg bg-fg px-4 py-2 font-black text-bg shadow-brutal">
            Upgrade
          </Link>
          <button type="button" onClick={() => setData(null)} className="rounded-md border-2 border-fg bg-card px-4 py-2 font-black shadow-brutal">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
