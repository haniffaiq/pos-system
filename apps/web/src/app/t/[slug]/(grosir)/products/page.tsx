"use client";

import React, { useState } from "react";
import { type ProductInput } from "@app/shared";
import { Badge, Button, Modal, Table } from "@app/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProductForm } from "@/components/grosir/ProductForm";
import { formatRupiah } from "@/lib/format";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext } from "@/lib/tenant";

interface Named {
  id: string;
  name: string;
}

interface ApiProduct {
  id: string;
  sku: string;
  name: string;
  category_id?: string | null;
  categoryId?: string;
  categoryName?: string;
  base_unit_id?: string;
  baseUnitId?: string;
  baseUnitName?: string;
  bulk_unit_id?: string | null;
  bulkUnitId?: string;
  bulkUnitName?: string;
  bulk_conversion?: number | null;
  bulkConversion?: number;
  buy_price?: number;
  buyPrice?: number;
  sell_price_eceran?: number;
  sellPriceEceran?: number;
  sell_price_grosir?: number;
  sellPriceGrosir?: number;
  min_stock?: number;
  minStock?: number;
  stock_qty?: number;
  stockQty?: number;
  is_active?: boolean;
  isActive?: boolean;
}

type EditableProduct = ProductInput & { id: string };

function byId(items: Named[]): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.name]));
}

function productInput(product: ApiProduct): EditableProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    categoryId: product.categoryId ?? product.category_id ?? undefined,
    baseUnitId: product.baseUnitId ?? product.base_unit_id ?? "",
    bulkUnitId: product.bulkUnitId ?? product.bulk_unit_id ?? undefined,
    bulkConversion: product.bulkConversion ?? product.bulk_conversion ?? undefined,
    buyPrice: product.buyPrice ?? product.buy_price ?? 0,
    sellPriceEceran: product.sellPriceEceran ?? product.sell_price_eceran ?? 0,
    sellPriceGrosir: product.sellPriceGrosir ?? product.sell_price_grosir ?? 0,
    minStock: product.minStock ?? product.min_stock ?? 0,
  };
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<EditableProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: ctx } = useQuery({ queryKey: ["tenant-ctx"], queryFn: fetchTenantContext });
  const canWrite = ctx?.role === "owner" || ctx?.role === "manager";
  const productsKey = ["grosir-products"];

  const { data: products = [], isLoading } = useQuery({
    queryKey: productsKey,
    queryFn: () => grosirApi<ApiProduct[]>("/products"),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["grosir-masterdata", "/masterdata/categories"],
    queryFn: () => grosirApi<Named[]>("/masterdata/categories"),
  });
  const { data: units = [] } = useQuery({
    queryKey: ["grosir-masterdata", "/masterdata/units"],
    queryFn: () => grosirApi<Named[]>("/masterdata/units"),
  });

  const categoryNames = byId(categories);
  const unitNames = byId(units);

  function done() {
    setCreating(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: productsKey });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black">Produk</h1>
          <p className="mt-1 text-sm text-fg/70">Kelola katalog, satuan, harga eceran/grosir, dan stok minimum.</p>
        </div>
        {canWrite ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            + Produk baru
          </Button>
        ) : (
          <Badge tone="soft">Owner/manager only</Badge>
        )}
      </div>

      <Table
        head={
          <tr>
            <th className="p-3">SKU</th>
            <th className="p-3">Nama</th>
            <th className="p-3">Kategori</th>
            <th className="p-3">Stok</th>
            <th className="p-3">Harga eceran</th>
            <th className="p-3">Harga grosir</th>
            <th className="p-3">Status</th>
            {canWrite && <th className="p-3">Aksi</th>}
          </tr>
        }
      >
        {isLoading ? (
          <tr>
            <td className="p-3 text-fg/70" colSpan={canWrite ? 8 : 7}>
              Loading…
            </td>
          </tr>
        ) : null}
        {!isLoading && products.length === 0 ? (
          <tr>
            <td className="p-3 text-fg/70" colSpan={canWrite ? 8 : 7}>
              Belum ada produk.
            </td>
          </tr>
        ) : null}
        {products.map((product) => {
          const input = productInput(product);
          const stockQty = product.stockQty ?? product.stock_qty ?? 0;
          const minStock = product.minStock ?? product.min_stock ?? 0;
          const baseUnit = product.baseUnitName ?? unitNames.get(input.baseUnitId) ?? "unit";
          const category = product.categoryName ?? (input.categoryId ? categoryNames.get(input.categoryId) : undefined) ?? "—";
          const active = product.isActive ?? product.is_active ?? false;

          return (
            <tr key={product.id}>
              <td className="p-3 font-bold">{product.sku}</td>
              <td className="p-3">{product.name}</td>
              <td className="p-3">{category}</td>
              <td className="p-3">
                {stockQty} {baseUnit}
                {stockQty <= minStock && <Badge tone="accent" className="ml-2">menipis</Badge>}
              </td>
              <td className="p-3">{formatRupiah(input.sellPriceEceran)}</td>
              <td className="p-3">{formatRupiah(input.sellPriceGrosir)}</td>
              <td className="p-3"><Badge tone={active ? "primary" : "soft"}>{active ? "aktif" : "nonaktif"}</Badge></td>
              {canWrite && (
                <td className="p-3">
                  <Button variant="secondary" onClick={() => setEditing(input)}>
                    Edit {product.name}
                  </Button>
                </td>
              )}
            </tr>
          );
        })}
      </Table>

      <Modal open={creating} onClose={() => setCreating(false)} title="Produk baru">
        <ProductForm onDone={done} />
      </Modal>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit produk">
        {editing && <ProductForm initial={editing} onDone={done} />}
      </Modal>
    </div>
  );
}
