"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, Input, Select, Table } from "@app/ui";
import { apiFetch } from "@/lib/api";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  sector: string;
  status: "active" | "suspended" | string;
}

type StatusFilter = "" | "active" | "suspended";

function tenantListPath(status: StatusFilter, search: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const trimmedSearch = search.trim();
  if (trimmedSearch) params.set("search", trimmedSearch);
  const query = params.toString();
  return `/admin/tenants${query ? `?${query}` : ""}`;
}

export default function TenantsPage() {
  const [filters, setFilters] = useState({ status: "" as StatusFilter, search: "" });
  const [draft, setDraft] = useState(filters);
  const tenantsPath = useMemo(() => tenantListPath(filters.status, filters.search), [filters.status, filters.search]);
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["admin", "tenants", filters],
    queryFn: () => apiFetch<Tenant[]>(tenantsPath),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">Platform tenants</p>
          <h1 className="font-display text-3xl font-black text-fg">Tenants</h1>
        </div>
        <Link href="/admin/tenants/new">
          <Button variant="primary">+ Register tenant</Button>
        </Link>
      </div>

      <Card className="p-4">
        <form
          className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters(draft);
          }}
        >
          <Input
            label="Search tenants"
            name="search"
            placeholder="Name or slug"
            value={draft.search}
            onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
          />
          <Select
            label="Status"
            name="status"
            value={draft.status}
            onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as StatusFilter }))}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
        </form>
      </Card>

      {isLoading ? <p className="font-bold text-fg/70">Loading tenants…</p> : null}
      {isError ? <p className="font-bold text-accent">{error instanceof Error ? error.message : "Unable to load tenants"}</p> : null}
      {!isLoading && !isError ? (
        <Table
          head={
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Sector</th>
              <th className="p-3">Status</th>
            </tr>
          }
        >
          {data.length === 0 ? (
            <tr>
              <td className="p-4 text-center font-bold text-fg/70" colSpan={4}>
                No tenants found.
              </td>
            </tr>
          ) : (
            data.map((tenant) => (
              <tr key={tenant.id}>
                <td className="p-3 font-bold">
                  <Link className="underline decoration-2 underline-offset-4" href={`/admin/tenants/${tenant.id}`}>
                    {tenant.name}
                  </Link>
                </td>
                <td className="p-3">{tenant.slug}</td>
                <td className="p-3 capitalize">{tenant.sector}</td>
                <td className="p-3">
                  <Badge tone={tenant.status === "active" ? "secondary" : "accent"}>{tenant.status}</Badge>
                </td>
              </tr>
            ))
          )}
        </Table>
      ) : null}
    </div>
  );
}
