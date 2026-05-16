import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PosPage from "./page";


vi.mock("@/lib/tenant", () => ({
  fetchTenantContext: vi.fn(async () => ({ userId: "user-1", tenantId: "tenant-1", tenantSlug: "warung-maju", role: "owner", sector: "grosir" })),
  tenantContextKey: (slug: string) => ["tenant-ctx", slug],
  tenantQueryKey: (tenantId: string | null | undefined, ...parts: string[]) => ["tenant", tenantId ?? "unknown", ...parts],
}));

vi.mock("@/lib/grosir", () => ({
  grosirApi: vi.fn(),
}));

import { grosirApi } from "@/lib/grosir";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const products = [
  {
    id: "prod-1",
    sku: "BRS-5",
    name: "Beras 5kg",
    stockQty: 42,
    sellPriceEceran: 15000,
    sellPriceGrosir: 330000,
    bulkConversion: 24,
  },
  {
    id: "prod-2",
    sku: "MNY-1",
    name: "Minyak 1L",
    stock_qty: 10,
    sell_price_eceran: 18000,
    sell_price_grosir: 0,
    bulk_conversion: null,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("POS / Penjualan page", () => {
  it("supports the cashier flow: search, cart unit choice, paid/change, and sale checkout", async () => {
    vi.mocked(grosirApi).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/products?activeOnly=true") return products;
      if (path === "/sales" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          paymentMethod: "qris",
          paid: 350000,
          items: [{ productId: "prod-1", unitType: "grosir", qty: 1 }],
        });
        return { invoice_no: "INV-20260515-0001", change: 20000 };
      }
      throw new Error(`unexpected request ${path}`);
    });

    renderWithQuery(<PosPage params={{ slug: "warung-maju" }} />);

    expect(await screen.findByRole("heading", { name: "Penjualan" })).toBeTruthy();
    await waitFor(() => expect(grosirApi).toHaveBeenCalledWith("/products?activeOnly=true"));

    fireEvent.change(screen.getByPlaceholderText("Cari produk / SKU"), { target: { value: "beras" } });
    expect(screen.getByText("Beras 5kg")).toBeTruthy();
    expect(screen.queryByText("Minyak 1L")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Tambah Beras 5kg/i }));
    const row = screen.getByRole("row", { name: /Beras 5kg/i });
    fireEvent.change(within(row).getByLabelText("Satuan Beras 5kg"), { target: { value: "grosir" } });
    fireEvent.change(within(row).getByLabelText("Qty Beras 5kg"), { target: { value: "1" } });

    expect(screen.getByText("Total: Rp 330.000")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Metode bayar"), { target: { value: "qris" } });
    fireEvent.change(screen.getByLabelText("Dibayar"), { target: { value: "350000" } });
    expect(screen.getByText("Kembalian: Rp 20.000")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Bayar" }));

    expect(await screen.findByText("Sukses: INV-20260515-0001 · kembalian Rp 20.000")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("row", { name: /Beras 5kg/i })).toBeNull());
  });

  it("keeps checkout blocked until fully paid and shows insufficient stock errors from the sale route", async () => {
    vi.mocked(grosirApi).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/products?activeOnly=true") return products;
      if (path === "/sales" && init?.method === "POST") throw new Error("stok tidak cukup");
      throw new Error(`unexpected request ${path}`);
    });

    renderWithQuery(<PosPage params={{ slug: "warung-maju" }} />);

    fireEvent.click(await screen.findByRole("button", { name: /Tambah Minyak 1L/i }));
    expect(screen.getByText("Total: Rp 18.000")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bayar" })).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Dibayar"), { target: { value: "18000" } });
    expect(screen.getByRole("button", { name: "Bayar" })).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "Bayar" }));

    expect(await screen.findByText("stok tidak cukup")).toBeTruthy();
    expect(screen.getByRole("row", { name: /Minyak 1L/i })).toBeTruthy();
  });
});
