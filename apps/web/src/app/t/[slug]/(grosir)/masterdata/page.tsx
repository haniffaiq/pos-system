"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Input } from "@app/ui";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext, tenantContextKey, tenantQueryKey } from "@/lib/tenant";

interface Named {
  id: string;
  name: string;
}

interface CrudSectionProps {
  title: string;
  path: string;
  canWrite: boolean;
  tenantId?: string;
}

function CrudSection({ title, path, canWrite, tenantId }: CrudSectionProps) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const queryKey = tenantQueryKey(tenantId, "grosir-masterdata", path);
  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => grosirApi<Named[]>(path),
    enabled: Boolean(tenantId),
  });
  const create = useMutation({
    mutationFn: () => grosirApi<Named>(path, { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey });
    },
  });

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-black">{title}</h2>
        {!canWrite && <Badge tone="soft">Owner/manager only</Badge>}
      </div>
      <div className="flex min-h-8 flex-wrap gap-2">
        {isLoading ? <span className="text-sm text-fg/70">Loading…</span> : null}
        {!isLoading && data.length === 0 ? <span className="text-sm text-fg/70">Belum ada data.</span> : null}
        {data.map((item) => (
          <Badge key={item.id} tone="soft">
            {item.name}
          </Badge>
        ))}
      </div>
      {canWrite && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input
            label={`Nama ${title}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={`Tambah ${title.toLowerCase()}`}
          />
          <Button className="sm:mb-0.5" type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
            Tambah {title}
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function MasterDataPage({ params }: { params: { slug: string } }) {
  const { data: ctx } = useQuery({ queryKey: tenantContextKey(params.slug), queryFn: () => fetchTenantContext(params.slug) });
  const canWrite = ctx?.role === "owner" || ctx?.role === "manager";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-black">Master Data</h1>
        <p className="mt-1 text-sm text-fg/70">Kelola kategori, satuan, dan supplier grosir.</p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <CrudSection title="Kategori" path="/masterdata/categories" canWrite={canWrite} tenantId={ctx?.tenantId} />
        <CrudSection title="Satuan" path="/masterdata/units" canWrite={canWrite} tenantId={ctx?.tenantId} />
        <CrudSection title="Supplier" path="/masterdata/suppliers" canWrite={canWrite} tenantId={ctx?.tenantId} />
      </div>
    </div>
  );
}
