"use client";

import React, { useState } from "react";
import { Badge, Button, Card, Input, Select, Table } from "@app/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext } from "@/lib/tenant";

interface ApiProduct {
  id: string;
  sku?: string;
  name: string;
  baseUnitName?: string;
  base_unit_name?: string;
  stockQty?: number;
  stock_qty?: number;
}

interface Adjustment {
  id: string;
  product_id: string;
  qty_base: number;
  reason: "rusak" | "hilang" | "koreksi";
  note: string | null;
  created_at: string;
}

type Reason = Adjustment["reason"];

function reasonLabel(reason: Reason): string {
  return { rusak: "Rusak", hilang: "Hilang", koreksi: "Koreksi" }[reason];
}

export default function AdjustmentsPage() {
  const qc = useQueryClient();
  const [productId, setProductId] = useState("");
  const [qtyBase, setQtyBase] = useState(0);
  const [reason, setReason] = useState<Reason>("rusak");
  const [note, setNote] = useState("");
  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });
  const canWrite = ctx?.role === "owner" || ctx?.role === "manager";
  const productsKey = ["grosir-products"];
  const adjustmentsKey = ["grosir-adjustments"];

  const { data: products = [] } = useQuery({
    queryKey: productsKey,
    queryFn: () => grosirApi<ApiProduct[]>("/products"),
  });
  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: adjustmentsKey,
    queryFn: () => grosirApi<Adjustment[]>("/adjustments"),
  });

  const productById = new Map(products.map((product) => [product.id, product]));
  const submit = useMutation({
    mutationFn: () =>
      grosirApi<Adjustment>("/adjustments", {
        method: "POST",
        body: JSON.stringify({
          productId,
          qtyBase,
          reason,
          note: note.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setProductId("");
      setQtyBase(0);
      setReason("rusak");
      setNote("");
      qc.invalidateQueries({ queryKey: adjustmentsKey });
      qc.invalidateQueries({ queryKey: productsKey });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black">Penyesuaian Stok</h1>
          <p className="mt-1 text-sm text-fg/70">Catat stok keluar non-penjualan atau koreksi stok dengan qty signed.</p>
        </div>
        {!canWrite && <Badge tone="soft">Owner/manager only</Badge>}
      </div>

      {canWrite && (
        <Card>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (productId && qtyBase !== 0) submit.mutate();
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 md:items-end">
              <Select label="Produk" value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">Pilih produk</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Select>
              <Input
                label="Qty signed"
                type="number"
                value={qtyBase}
                onChange={(event) => setQtyBase(Number(event.target.value))}
                placeholder="-5"
              />
              <Select label="Alasan" value={reason} onChange={(event) => setReason(event.target.value as Reason)}>
                <option value="rusak">Rusak</option>
                <option value="hilang">Hilang</option>
                <option value="koreksi">Koreksi</option>
              </Select>
              <Input label="Catatan" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opsional" />
            </div>
            <Button type="submit" variant="primary" disabled={!productId || qtyBase === 0 || submit.isPending}>
              Simpan penyesuaian
            </Button>
          </form>
        </Card>
      )}

      <Table
        head={
          <tr>
            <th className="p-3">Produk</th>
            <th className="p-3">Qty</th>
            <th className="p-3">Alasan</th>
            <th className="p-3">Catatan</th>
          </tr>
        }
      >
        {isLoading ? (
          <tr>
            <td className="p-3 text-fg/70" colSpan={4}>
              Loading…
            </td>
          </tr>
        ) : null}
        {!isLoading && adjustments.length === 0 ? (
          <tr>
            <td className="p-3 text-fg/70" colSpan={4}>
              Belum ada penyesuaian.
            </td>
          </tr>
        ) : null}
        {adjustments.map((adjustment) => {
          const product = productById.get(adjustment.product_id);
          const unit = product?.baseUnitName ?? product?.base_unit_name ?? "unit";
          return (
            <tr key={adjustment.id}>
              <td className="p-3">{product?.name ?? adjustment.product_id}</td>
              <td className="p-3 font-bold">{adjustment.qty_base} {unit}</td>
              <td className="p-3">{reasonLabel(adjustment.reason)}</td>
              <td className="p-3">{adjustment.note ?? "—"}</td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
