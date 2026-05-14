import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductsPage from "./page";

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
  sku: "BRS-5",
  name: "Beras 5kg",
  categoryName: "Beras",
  baseUnitName: "pcs",
  bulkUnitName: "dus",
  stockQty: 4,
  minStock: 5,
  sellPriceEceran: 15000,
  sellPriceGrosir: 330000,
  isActive: true,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("grosir products page", () => {
  it("lists products with integer Rupiah prices, active status, units, and low-stock badge", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "owner-1",
      tenantId: "tenant-1",
      role: "owner",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockImplementation(async (path: string) => {
      if (path === "/products") return [product];
      if (path === "/masterdata/categories") return [];
      if (path === "/masterdata/units") return [];
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<ProductsPage />);

    expect(await screen.findByText("Produk")).toBeTruthy();
    expect(await screen.findByText("BRS-5")).toBeTruthy();
    expect(screen.getByText("Beras 5kg")).toBeTruthy();
    expect(screen.getByText("Beras")).toBeTruthy();
    expect(screen.getByText("4 pcs")).toBeTruthy();
    expect(screen.getByText("menipis")).toBeTruthy();
    expect(screen.getByText("aktif")).toBeTruthy();
    expect(screen.getByText("Rp 15.000")).toBeTruthy();
    expect(screen.getByText("Rp 330.000")).toBeTruthy();
  });

  it("lets owners open an edit form seeded from the selected product", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "owner-1",
      tenantId: "tenant-1",
      role: "owner",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockImplementation(async (path: string) => {
      if (path === "/products") return [product];
      if (path === "/masterdata/categories") return [{ id: "cat-1", name: "Beras" }];
      if (path === "/masterdata/units") return [
        { id: "unit-1", name: "pcs" },
        { id: "unit-2", name: "dus" },
      ];
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<ProductsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Beras 5kg" }));

    expect(await screen.findByText("Edit produk")).toBeTruthy();
    expect(screen.getByLabelText("SKU")).toHaveProperty("value", "BRS-5");
    expect(screen.getByLabelText("Nama")).toHaveProperty("value", "Beras 5kg");
  });

  it("hides product create and edit actions from cashiers while keeping products readable", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "cashier-1",
      tenantId: "tenant-1",
      role: "cashier",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockResolvedValue([product]);

    renderWithQuery(<ProductsPage />);

    expect(await screen.findByText("Beras 5kg")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Produk baru" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Beras 5kg" })).toBeNull();
    expect(screen.getByText("Owner/manager only")).toBeTruthy();
  });
});
