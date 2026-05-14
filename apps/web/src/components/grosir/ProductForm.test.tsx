import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductForm } from "./ProductForm";

vi.mock("@/lib/grosir", () => ({ grosirApi: vi.fn() }));
import { grosirApi } from "@/lib/grosir";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProductForm", () => {
  it("loads category/unit selects and creates a product with integer Rupiah fields", async () => {
    const onDone = vi.fn();
    vi.mocked(grosirApi).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/masterdata/categories") return [{ id: "cat-1", name: "Beras" }];
      if (path === "/masterdata/units") return [{ id: "unit-1", name: "pcs" }, { id: "unit-2", name: "dus" }];
      if (path === "/products" && init?.method === "POST") return { id: "prod-1" };
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<ProductForm onDone={onDone} />);

    expect(await screen.findByText("Beras")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("SKU"), { target: { value: "BRS-5" } });
    fireEvent.change(screen.getByLabelText("Nama"), { target: { value: "Beras 5kg" } });
    fireEvent.change(screen.getByLabelText("Kategori"), { target: { value: "cat-1" } });
    fireEvent.change(screen.getByLabelText("Satuan dasar (eceran)"), { target: { value: "unit-1" } });
    fireEvent.change(screen.getByLabelText("Satuan grosir (opsional)"), { target: { value: "unit-2" } });
    fireEvent.change(screen.getByLabelText("Konversi grosir (isi ke base)"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Harga beli (per eceran)"), { target: { value: "12000" } });
    fireEvent.change(screen.getByLabelText("Harga jual eceran"), { target: { value: "15000" } });
    fireEvent.change(screen.getByLabelText("Harga jual grosir (per satuan grosir)"), { target: { value: "330000" } });
    fireEvent.change(screen.getByLabelText("Stok minimum"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => {
      expect(grosirApi).toHaveBeenCalledWith("/products", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sku: "BRS-5", name: "Beras 5kg", categoryId: "cat-1", baseUnitId: "unit-1", bulkUnitId: "unit-2",
          bulkConversion: 24, buyPrice: 12000, sellPriceEceran: 15000, sellPriceGrosir: 330000, minStock: 5,
        }),
      }));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
