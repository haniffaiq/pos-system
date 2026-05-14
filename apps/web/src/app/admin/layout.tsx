"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { type ReactNode } from "react";
import { Button, Navbar } from "@app/ui";
import { RequireRole } from "@/components/RequireRole";
import { clearSession } from "@/lib/auth";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  function logOut() {
    clearSession();
    router.push("/admin/login");
  }

  return (
    <RequireRole role="platform_admin" redirect="/admin/login">
      <Navbar
        initials="OP"
        title="Operational · Admin"
        right={
          <Button variant="white" onClick={logOut}>
            Log out
          </Button>
        }
      />
      <div className="flex min-h-[calc(100vh-57px)] bg-background text-fg">
        <aside className="w-56 shrink-0 space-y-2 border-r-2 border-fg bg-card p-4 shadow-brutal-sm">
          <Link href="/admin" className="block rounded-md border-2 border-transparent px-3 py-2 font-display font-bold hover:border-fg hover:bg-primary/20">
            Dashboard
          </Link>
          <Link href="/admin/tenants" className="block rounded-md border-2 border-fg bg-primary px-3 py-2 font-display font-bold shadow-brutal-sm">
            Tenants
          </Link>
          <Link href="/admin/audit-log" className="block rounded-md border-2 border-transparent px-3 py-2 font-display font-bold hover:border-fg hover:bg-primary/20">
            Audit log
          </Link>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </RequireRole>
  );
}
