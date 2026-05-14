"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Table } from "@app/ui";
import { apiFetch } from "@/lib/api";

interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  sector: string;
  status: "active" | "suspended" | string;
  users: TenantUser[];
}

export default function TenantDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "tenant", params.id];
  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => apiFetch<TenantDetail>(`/admin/tenants/${params.id}`),
  });
  const statusMutation = useMutation({
    mutationFn: (status: "active" | "suspended") =>
      apiFetch(`/admin/tenants/${params.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (isLoading) return <p className="font-bold text-fg/70">Loading tenant…</p>;
  if (isError) return <p className="font-bold text-accent">{error instanceof Error ? error.message : "Unable to load tenant"}</p>;
  if (!data) return <p className="font-bold text-fg/70">Tenant not found.</p>;

  const nextStatus = data.status === "active" ? "suspended" : "active";

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">Tenant detail</p>
            <h1 className="font-display text-3xl font-black text-fg">{data.name}</h1>
            <p className="mt-1 font-bold text-fg/70">
              {data.slug} · {data.sector}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={data.status === "active" ? "secondary" : "accent"}>{data.status}</Badge>
            <Button
              type="button"
              variant={data.status === "active" ? "accent" : "secondary"}
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(nextStatus)}
            >
              {statusMutation.isPending ? "Saving…" : data.status === "active" ? "Suspend" : "Activate"}
            </Button>
          </div>
        </div>
        {statusMutation.isError ? (
          <p className="mt-3 font-bold text-accent">
            {statusMutation.error instanceof Error ? statusMutation.error.message : "Unable to update tenant status"}
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-black text-fg">Users</h2>
        <Table
          head={
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
            </tr>
          }
        >
          {data.users.length === 0 ? (
            <tr>
              <td className="p-4 text-center font-bold text-fg/70" colSpan={4}>
                No users found.
              </td>
            </tr>
          ) : (
            data.users.map((user) => (
              <tr key={user.id}>
                <td className="p-3 font-bold">{user.name}</td>
                <td className="p-3">{user.email}</td>
                <td className="p-3">{user.role}</td>
                <td className="p-3">{user.status}</td>
              </tr>
            ))
          )}
        </Table>
      </Card>
    </div>
  );
}
