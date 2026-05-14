import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StockInPage from "./page";

vi.mock("@/lib/grosir", () => ({
  grosirApi: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  fetchTenantContext: vi.fn(),
}));

import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext } from "@/lib/tenant";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const product = {
  id: "prod-1",
  name: "Beras 5kg",
  baseUnitId: "unit-pcs",
  baseUnitName: "pcs",
  bulkUnitId: "unit-dus",
  bulkUnitName: "dus",
  bulkConversion: 24,
  stockQty: 10,
};

const unitPcs = { id: "unit-pcs", name: "pcs" };
const unitDus = { id: "unit-dus", name: "dus" };
const supplier = { id: "supplier-1", name: "Gudang Jaya" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("grosir stock-in page", () => {
  it("lets managers add base and bulk line items, shows converted stock totals, and submits to stock-in", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "manager-1",
      tenantId: "tenant-1",
      role: "manager",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return { id: "stock-in-1" };
      if (path === "/products") return [product];
      if (path === "/masterdata/units") return [unitPcs, unitDus];
      if (path === "/masterdata/suppliers") return [supplier];
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<StockInPage />);

    expect(await screen.findByText("Barang Masuk")).toBeTruthy();
    fireEvent.change(await screen.findByLabelText("Supplier"), { target: { value: "supplier-1" } });
    fireEvent.change(screen.getByLabelText("Catatan"), { target: { value: "Restock awal" } });

    fireEvent.change(screen.getByLabelText("Produk"), { target: { value: "prod-1" } });
    fireEvent.change(screen.getByLabelText("Satuan"), { target: { value: "unit-dus" } });
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Harga/satuan"), { target: { value: "120000" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Tambah" }));

    fireEvent.change(screen.getByLabelText("Produk"), { target: { value: "prod-1" } });
    fireEvent.change(screen.getByLabelText("Satuan"), { target: { value: "unit-pcs" } });
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Harga/satuan"), { target: { value: "6000" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Tambah" }));

    expect(await screen.findByText("2 dus = 48 pcs")).toBeTruthy();
    expect(screen.getByText("3 pcs")).toBeTruthy();
    expect(screen.getByText("Total konversi: 51 unit dasar")).toBeTruthy();
    expect(screen.getByText("Total: Rp 258.000")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Simpan barang masuk" }));

    await waitFor(() => {
      expect(grosirApi).toHaveBeenCalledWith(
        "/stock-in",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            supplierId: "supplier-1",
            note: "Restock awal",
            items: [
              { productId: "prod-1", unitId: "unit-dus", qty: 2, unitCost: 120000 },
              { productId: "prod-1", unitId: "unit-pcs", qty: 3, unitCost: 6000 },
            ],
          }),
        }),
      );
    });
  });

  it("hides the stock-in form from cashiers", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "cashier-1",
      tenantId: "tenant-1",
      role: "cashier",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockResolvedValue([]);

    renderWithQuery(<StockInPage />);

    expect(await screen.findByText("Barang Masuk")).toBeTruthy();
    expect(screen.getByText("Owner/manager only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Tambah" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Simpan barang masuk" })).toBeNull();
  });
});
