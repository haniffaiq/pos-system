"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useState, type ReactNode } from "react";
import { Button, Navbar } from "@app/ui";
import { RequireRole } from "@/components/RequireRole";
import { clearSession } from "@/lib/auth";

const navItems = [
  { href: "/admin", label: "Dashboard", match: (p: string) => p === "/admin" },
  { href: "/admin/tenants", label: "Tenants", match: (p: string) => p.startsWith("/admin/tenants") },
  { href: "/admin/audit-log", label: "Audit log", match: (p: string) => p.startsWith("/admin/audit-log") },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin";
  const [mobileOpen, setMobileOpen] = useState(false);

  function logOut() {
    clearSession();
    router.push("/admin/login");
  }

  return (
    <RequireRole role="platform_admin" redirect="/admin/login">
      <Navbar
        initials="OP"
        title="Operational · Admin"
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
          className="fixed inset-y-[57px] left-0 z-40 w-64 -translate-x-full space-y-2 overflow-y-auto border-r-2 border-fg bg-card p-4 shadow-brutal-sm transition-transform data-[open=true]:translate-x-0 md:static md:inset-auto md:w-56 md:shrink-0 md:translate-x-0"
        >
          {navItems.map((item) => {
            const active = item.match(pathname);
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
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </RequireRole>
  );
}
