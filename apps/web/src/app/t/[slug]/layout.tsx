"use client";

import type { ReactNode } from "react";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button, Navbar } from "@app/ui";
import { RequireRole } from "@/components/RequireRole";
import { clearSession } from "@/lib/auth";
import { fetchTenantContext } from "@/lib/tenant";

interface Props {
  children: ReactNode;
  params: { slug: string };
}

export default function TenantLayout({ children, params }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });

  function logOut() {
    clearSession();
    router.push(`/t/${params.slug}/login`);
  }

  const base = `/t/${params.slug}`;
  const items: { href: string; label: string }[] = [
    { href: base, label: "Dashboard" },
    ...(ctx?.sector === "grosir"
      ? [
          { href: `${base}/pos`, label: "POS / Penjualan" },
          { href: `${base}/products`, label: "Produk" },
          { href: `${base}/stock-in`, label: "Barang Masuk" },
          { href: `${base}/adjustments`, label: "Penyesuaian Stok" },
          { href: `${base}/masterdata`, label: "Master Data" },
          { href: `${base}/reports`, label: "Laporan" },
          { href: `${base}/billing`, label: "Billing" },
          { href: `${base}/notifications`, label: "Notifikasi" },
        ]
      : []),
  ];

  return (
    <RequireRole role={["owner", "manager", "cashier"]} redirect={`/t/${params.slug}/login`}>
      <Navbar
        initials={params.slug.slice(0, 2).toUpperCase()}
        title={`Operational · ${params.slug}`}
        left={
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-fg bg-card font-display text-xl font-black shadow-brutal-sm md:hidden"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        }
        right={
          <Button variant="white" onClick={logOut}>
            Log out
          </Button>
        }
      />
      <div className="flex min-h-[calc(100vh-57px)] bg-background text-fg">
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-x-0 bottom-0 top-[57px] z-30 bg-fg/40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside
          data-open={mobileOpen}
          className="fixed inset-y-[57px] left-0 z-40 w-64 -translate-x-full space-y-2 overflow-y-auto border-r-2 border-fg bg-card p-4 shadow-brutal-sm transition-transform data-[open=true]:translate-x-0 md:static md:inset-auto md:w-52 md:shrink-0 md:translate-x-0"
        >
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={
                  active
                    ? "block rounded-md border-2 border-fg bg-primary px-3 py-2 font-display font-bold shadow-brutal-sm"
                    : "block rounded-md border-2 border-transparent px-3 py-2 font-display font-bold hover:border-fg hover:bg-primary/20"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6" data-sector={ctx?.sector}>
          {children}
        </main>
      </div>
    </RequireRole>
  );
}
