"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Table } from "@app/ui";
import { apiFetch } from "@/lib/api";

interface AuditEntry {
  id: string;
  admin_id: string | null;
  action: string;
  target: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function formatMeta(meta: AuditEntry["meta"]) {
  if (!meta || Object.keys(meta).length === 0) return "—";
  return JSON.stringify(meta, null, 2);
}

export default function AuditLogPage() {
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: () => apiFetch<AuditEntry[]>("/admin/audit-log"),
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">Platform activity</p>
        <h1 className="font-display text-3xl font-black text-fg">Audit log</h1>
      </div>

      <Card className="p-4">
        <p className="max-w-3xl text-sm font-bold text-fg/70">
          Review platform-admin actions recorded in <code className="rounded bg-white px-1">platform_audit_log</code>.
        </p>
      </Card>

      {isLoading ? <p className="font-bold text-fg/70">Loading audit log…</p> : null}
      {isError ? <p className="font-bold text-accent">{error instanceof Error ? error.message : "Unable to load audit log"}</p> : null}

      {!isLoading && !isError ? (
        <Table
          head={
            <tr>
              <th className="p-3">Action</th>
              <th className="p-3">Target</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Meta</th>
              <th className="p-3">Waktu</th>
            </tr>
          }
        >
          {data.length === 0 ? (
            <tr>
              <td className="p-4 text-center font-bold text-fg/70" colSpan={5}>
                No audit entries yet.
              </td>
            </tr>
          ) : (
            data.map((entry) => (
              <tr key={entry.id}>
                <td className="p-3 font-bold">{entry.action}</td>
                <td className="p-3">{entry.target ?? "—"}</td>
                <td className="p-3">{entry.admin_id ?? "—"}</td>
                <td className="max-w-xs whitespace-pre-wrap break-words p-3 font-mono text-xs">{formatMeta(entry.meta)}</td>
                <td className="p-3">{formatDate(entry.created_at)}</td>
              </tr>
            ))
          )}
        </Table>
      ) : null}
    </div>
  );
}
