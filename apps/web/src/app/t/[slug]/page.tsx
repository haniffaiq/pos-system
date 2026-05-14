"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card } from "@app/ui";
import { fetchTenantContext } from "@/lib/tenant";

export default function TenantDashboard() {
  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });

  if (!ctx) return <p className="text-fg/70">Loading…</p>;

  if (ctx.sector !== "grosir") {
    return (
      <Card className="max-w-lg">
        <h1 className="mb-2 text-3xl font-black">Module coming soon</h1>
        <p className="text-fg/70">
          The <Badge tone="soft">{ctx.sector}</Badge> module is not available yet.
        </p>
      </Card>
    );
  }

  return <p className="text-fg/70">Grosir module loads here (Phase 2).</p>;
}
