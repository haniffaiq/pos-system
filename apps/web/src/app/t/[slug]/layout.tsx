"use client";

import type { ReactNode } from "react";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });

  function logOut() {
    clearSession();
    router.push(`/t/${params.slug}/login`);
  }

  return (
    <RequireRole role={["owner", "manager", "cashier"]} redirect={`/t/${params.slug}/login`}>
      <Navbar
        initials={params.slug.slice(0, 2).toUpperCase()}
        title={`Operational · ${params.slug}`}
        right={
          <Button variant="white" onClick={logOut}>
            Log out
          </Button>
        }
      />
      <div className="flex">
        <aside className="min-h-[calc(100vh-57px)] w-52 space-y-2 border-r-2 border-fg bg-card p-4">
          <Link href={`/t/${params.slug}`} className="block font-display font-bold">
            Dashboard
          </Link>
          {/* Grosir module links are injected in Phase 2. */}
        </aside>
        <main className="flex-1 p-6" data-sector={ctx?.sector}>
          {children}
        </main>
      </div>
    </RequireRole>
  );
}
