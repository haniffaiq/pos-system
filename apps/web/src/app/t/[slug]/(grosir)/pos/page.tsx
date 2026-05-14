"use client";

import React, { useMemo, useState } from "react";
import { Button, Card, Input, Select, Table, Toast } from "@app/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatRupiah } from "@/lib/format";
import { grosirApi } from "@/lib/grosir";

type UnitType = "eceran" | "grosir";
type PaymentMethod = "cash" | "transfer" | "qris";

interface ApiProduct {
  id: string;
  sku: string;
  name: string;
  stock_qty?: number;
  stockQty?: number;
  sell_price_eceran?: number;
  sellPriceEceran?: number;
  sell_price_grosir?: number;
  sellPriceGrosir?: number;
  bulk_conversion?: number | null;
  bulkConversion?: number | null;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  stockQty: number;
  sellPriceEceran: number;
  sellPriceGrosir: number;
  bulkConversion: number | null;
}

interface CartLine {
  product: Product;
  unitType: UnitType;
  qty: number;
}

interface SaleResponse {
  invoice_no?: string;
  invoiceNo?: string;
  change: number;
}

const productsKey = ["grosir-products", "pos", "active"];

function normalizeProduct(product: ApiProduct): Product {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    stockQty: product.stockQty ?? product.stock_qty ?? 0,
    sellPriceEceran: product.sellPriceEceran ?? product.sell_price_eceran ?? 0,
    sellPriceGrosir: product.sellPriceGrosir ?? product.sell_price_grosir ?? 0,
    bulkConversion: product.bulkConversion ?? product.bulk_conversion ?? null,
  };
}

function lineUnitPrice(line: CartLine): number {
  return line.unitType === "grosir" ? line.product.sellPriceGrosir : line.product.sellPriceEceran;
}

export default function PosPage() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: productsKey,
    queryFn: async () => (await grosirApi<ApiProduct[]>("/products?activeOnly=true")).map(normalizeProduct),
  });
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paid, setPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [toast, setToast] = useState<{ tone: "secondary" | "accent"; message: string } | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term),
    );
  }, [products, search]);

  const total = cart.reduce((sum, line) => sum + line.qty * lineUnitPrice(line), 0);
  const change = paid - total;

  function addToCart(product: Product) {
    setCart((current) => [...current, { product, unitType: "eceran", qty: 1 }]);
    setToast(null);
  }

  function updateLine(index: number, patch: Partial<CartLine>) {
    setCart((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    setCart((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function checkout() {
    try {
      const sale = await grosirApi<SaleResponse>("/sales", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod,
          paid,
          items: cart.map((line) => ({ productId: line.product.id, unitType: line.unitType, qty: line.qty })),
        }),
      });
      const invoiceNo = sale.invoiceNo ?? sale.invoice_no ?? "transaksi";
      setToast({ tone: "secondary", message: `Sukses: ${invoiceNo} · kembalian ${formatRupiah(sale.change)}` });
      setCart([]);
      setPaid(0);
      await qc.invalidateQueries({ queryKey: productsKey });
    } catch (error) {
      setToast({ tone: "accent", message: error instanceof Error ? error.message : "Gagal menyimpan transaksi" });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <h1 className="text-3xl font-black">Penjualan</h1>
          <p className="mt-1 text-sm text-fg/70">Cari produk, pilih satuan eceran/grosir, lalu checkout transaksi kasir.</p>
        </div>
        <Input placeholder="Cari produk / SKU" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {isLoading ? <Card className="text-fg/70">Loading…</Card> : null}
          {!isLoading && filtered.length === 0 ? <Card className="text-fg/70">Produk tidak ditemukan.</Card> : null}
          {filtered.map((product) => (
            <Card key={product.id} className="space-y-3" hover>
              <div>
                <p className="font-black">{product.name}</p>
                <p className="text-sm text-fg/70">{product.sku} · stok {product.stockQty}</p>
                <p className="font-bold">{formatRupiah(product.sellPriceEceran)}</p>
                {product.bulkConversion ? (
                  <p className="text-xs font-bold text-fg/70">
                    Grosir {formatRupiah(product.sellPriceGrosir)} / {product.bulkConversion} unit
                  </p>
                ) : null}
              </div>
              <Button variant="secondary" onClick={() => addToCart(product)}>
                Tambah {product.name}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl font-black">Keranjang</h2>
        <Table
          head={
            <tr>
              <th className="p-2">Produk</th>
              <th className="p-2">Satuan</th>
              <th className="p-2">Qty</th>
              <th className="p-2">Subtotal</th>
              <th className="p-2">Aksi</th>
            </tr>
          }
        >
          {cart.length === 0 ? (
            <tr>
              <td className="p-2 text-fg/70" colSpan={5}>Keranjang kosong.</td>
            </tr>
          ) : null}
          {cart.map((line, index) => (
            <tr key={`${line.product.id}-${index}`}>
              <td className="p-2 font-bold">{line.product.name}</td>
              <td className="p-2">
                <select
                  aria-label={`Satuan ${line.product.name}`}
                  className="rounded border-2 border-fg bg-card px-2 py-1"
                  value={line.unitType}
                  onChange={(event) => updateLine(index, { unitType: event.target.value as UnitType })}
                >
                  <option value="eceran">eceran</option>
                  {line.product.bulkConversion ? <option value="grosir">grosir</option> : null}
                </select>
              </td>
              <td className="p-2">
                <input
                  aria-label={`Qty ${line.product.name}`}
                  type="number"
                  min={1}
                  className="w-20 rounded border-2 border-fg bg-card px-2 py-1"
                  value={line.qty}
                  onChange={(event) => updateLine(index, { qty: Math.max(1, Number(event.target.value) || 1) })}
                />
              </td>
              <td className="p-2">{formatRupiah(line.qty * lineUnitPrice(line))}</td>
              <td className="p-2">
                <button className="font-black text-accent" onClick={() => removeLine(index)} type="button">
                  Hapus
                </button>
              </td>
            </tr>
          ))}
        </Table>
        <Card className="space-y-2">
          <p className="text-2xl font-black">Total: {formatRupiah(total)}</p>
          <Select label="Metode bayar" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
            <option value="cash">Tunai</option>
            <option value="transfer">Transfer</option>
            <option value="qris">QRIS</option>
          </Select>
          <Input label="Dibayar" type="number" min={0} value={paid} onChange={(event) => setPaid(Number(event.target.value) || 0)} />
          <p className={`font-bold ${change < 0 ? "text-accent" : ""}`}>Kembalian: {formatRupiah(change)}</p>
          <Button variant="primary" onClick={checkout} disabled={cart.length === 0 || paid < total}>
            Bayar
          </Button>
        </Card>
      </div>
      {toast && <Toast tone={toast.tone} message={toast.message} />}
    </div>
  );
}
