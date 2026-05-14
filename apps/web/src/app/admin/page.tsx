"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Table } from "@app/ui";
import { apiFetch } from "@/lib/api";

interface PlatformStats {
  total: number;
  bySector: { sector: string; n: number }[];
  recent: { id: string; name: string; slug: string; sector: string; createdAt?: string; created_at?: string }[];
}

export default function AdminDashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => apiFetch<PlatformStats>("/admin/stats"),
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">Platform overview</p>
        <h1 className="font-display text-3xl font-black text-fg">Dashboard</h1>
      </div>

      {isLoading ? <p className="font-bold text-fg/70">Loading dashboard…</p> : null}
      {isError ? <p className="font-bold text-accent">{error instanceof Error ? error.message : "Unable to load dashboard"}</p> : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card hover>
              <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">Total tenants</p>
              <p className="mt-2 font-display text-5xl font-black">{data.total}</p>
              <p className="mt-2 text-sm font-bold text-fg/70">Registered across the platform</p>
            </Card>

            <Card hover className="lg:col-span-2">
              <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">By sector</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.bySector.length === 0 ? (
                  <p className="font-bold text-fg/70">No sector data yet.</p>
                ) : (
                  data.bySector.map((sector) => (
                    <Badge key={sector.sector} tone="soft" className="capitalize">
                      {sector.sector}: {sector.n}
                    </Badge>
                  ))
                )}
              </div>
            </Card>
          </div>

          <Card className="p-0">
            <div className="border-b-2 border-fg p-4">
              <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">Recent registrations</p>
              <h2 className="font-display text-2xl font-black">Newest tenants</h2>
            </div>
            <Table
              head={
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Slug</th>
                  <th className="p-3">Sector</th>
                </tr>
              }
            >
              {data.recent.length === 0 ? (
                <tr>
                  <td className="p-4 text-center font-bold text-fg/70" colSpan={3}>
                    No recent registrations yet.
                  </td>
                </tr>
              ) : (
                data.recent.map((tenant) => (
                  <tr key={tenant.id}>
                    <td className="p-3 font-bold">{tenant.name}</td>
                    <td className="p-3">{tenant.slug}</td>
                    <td className="p-3 capitalize">{tenant.sector}</td>
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
