"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Input, Select, Table } from "@app/ui";
import { formatRupiah } from "@/lib/format";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext } from "@/lib/tenant";

interface Named {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  base_unit_id?: string;
  baseUnitId?: string;
  baseUnitName?: string;
  bulk_unit_id?: string | null;
  bulkUnitId?: string | null;
  bulkUnitName?: string | null;
  bulk_conversion?: number | null;
  bulkConversion?: number | null;
  stock_qty?: number;
  stockQty?: number;
}

interface Line {
  productId: string;
  unitId: string;
  qty: number;
  unitCost: number;
}

const emptyLine: Line = { productId: "", unitId: "", qty: 1, unitCost: 0 };

function unitId(product: Product, kind: "base" | "bulk"): string | undefined | null {
  return kind === "base" ? product.baseUnitId ?? product.base_unit_id : product.bulkUnitId ?? product.bulk_unit_id;
}

function conversion(product: Product): number {
  return product.bulkConversion ?? product.bulk_conversion ?? 1;
}

function lineBaseQty(line: Line, product: Product | undefined): number {
  if (!product) return line.qty;
  if (line.unitId === unitId(product, "bulk")) return line.qty * conversion(product);
  return line.qty;
}

export default function StockInPage() {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<Line>(emptyLine);
  const productsKey = ["grosir-products"];

  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });
  const canWrite = ctx?.role === "owner" || ctx?.role === "manager";
  const { data: products = [] } = useQuery({ queryKey: productsKey, queryFn: () => grosirApi<Product[]>("/products") });
  const { data: units = [] } = useQuery({
    queryKey: ["grosir-masterdata", "/masterdata/units"],
    queryFn: () => grosirApi<Named[]>("/masterdata/units"),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["grosir-masterdata", "/masterdata/suppliers"],
    queryFn: () => grosirApi<Named[]>("/masterdata/suppliers"),
  });

  const productsById = new Map(products.map((product) => [product.id, product]));
  const unitsById = new Map(units.map((unit) => [unit.id, unit.name]));
  const totalCost = lines.reduce((sum, line) => sum + line.qty * line.unitCost, 0);
  const totalBaseQty = lines.reduce((sum, line) => sum + lineBaseQty(line, productsById.get(line.productId)), 0);
  const selectedProduct = productsById.get(draft.productId);
  const validLine = draft.productId && draft.unitId && draft.qty > 0 && draft.unitCost >= 0;

  const submit = useMutation({
    mutationFn: () =>
      grosirApi("/stock-in", {
        method: "POST",
        body: JSON.stringify({ supplierId: supplierId || undefined, note: note.trim() || undefined, items: lines }),
      }),
    onSuccess: () => {
      setLines([]);
      setNote("");
      setSupplierId("");
      qc.invalidateQueries({ queryKey: productsKey });
    },
  });

  function addLine() {
    if (!validLine) return;
    setLines((current) => [...current, draft]);
    setDraft(emptyLine);
  }

  function describeQty(line: Line): string {
    const product = productsById.get(line.productId);
    const unitName = unitsById.get(line.unitId) ?? "unit";
    const baseName = product?.baseUnitName ?? unitsById.get(unitId(product ?? ({} as Product), "base") ?? "") ?? unitName;
    const baseQty = lineBaseQty(line, product);
    if (product && line.unitId === unitId(product, "bulk")) return `${line.qty} ${unitName} = ${baseQty} ${baseName}`;
    return `${line.qty} ${unitName}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black">Barang Masuk</h1>
          <p className="mt-1 text-sm text-fg/70">Catat penerimaan stok dari supplier dengan konversi satuan otomatis.</p>
        </div>
        {!canWrite && <Badge tone="soft">Owner/manager only</Badge>}
      </div>

      {canWrite && (
        <>
          <Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select label="Supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">— tanpa supplier —</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </Select>
              <Input label="Catatan" value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-black">Tambah item</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 sm:items-end">
              <Select label="Produk" value={draft.productId} onChange={(event) => setDraft({ ...draft, productId: event.target.value, unitId: "" })}>
                <option value="">— pilih produk —</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </Select>
              <Select label="Satuan" value={draft.unitId} onChange={(event) => setDraft({ ...draft, unitId: event.target.value })}>
                <option value="">— pilih satuan —</option>
                {selectedProduct ? [unitId(selectedProduct, "base"), unitId(selectedProduct, "bulk")].filter(Boolean).map((id) => (
                  <option key={id} value={id!}>{unitsById.get(id!) ?? id}</option>
                )) : units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </Select>
              <Input label="Qty" min={1} type="number" value={draft.qty} onChange={(event) => setDraft({ ...draft, qty: Number(event.target.value) })} />
              <Input label="Harga/satuan" min={0} type="number" value={draft.unitCost} onChange={(event) => setDraft({ ...draft, unitCost: Number(event.target.value) })} />
              <Button variant="secondary" onClick={addLine} disabled={!validLine}>+ Tambah</Button>
            </div>
          </Card>
        </>
      )}

      <Table head={<tr><th className="p-3">Produk</th><th className="p-3">Qty</th><th className="p-3">Harga</th><th className="p-3">Subtotal</th></tr>}>
        {lines.length === 0 ? <tr><td className="p-3 text-fg/70" colSpan={4}>Belum ada item barang masuk.</td></tr> : null}
        {lines.map((line, index) => (
          <tr key={`${line.productId}-${line.unitId}-${index}`}>
            <td className="p-3">{productsById.get(line.productId)?.name ?? "—"}</td>
            <td className="p-3">{describeQty(line)}</td>
            <td className="p-3">{formatRupiah(line.unitCost)}</td>
            <td className="p-3">{formatRupiah(line.qty * line.unitCost)}</td>
          </tr>
        ))}
      </Table>

      {canWrite && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-fg/70">Total konversi: {totalBaseQty} unit dasar</p>
            <span className="text-2xl font-black">Total: {formatRupiah(totalCost)}</span>
          </div>
          <Button variant="primary" onClick={() => submit.mutate()} disabled={lines.length === 0 || submit.isPending}>
            Simpan barang masuk
          </Button>
        </Card>
      )}
    </div>
  );
}
