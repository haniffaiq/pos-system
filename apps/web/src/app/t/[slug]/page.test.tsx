import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TenantDashboard from "./page";

vi.mock("@/lib/tenant", () => ({
  fetchTenantContext: vi.fn(),
}));

vi.mock("@/lib/grosir", () => ({
  grosirApi: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext } from "@/lib/tenant";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("tenant dashboard", () => {
  it("shows a coming-soon card for sectors that do not have a registered module", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "owner",
      sector: "retail",
    });

    renderWithQuery(<TenantDashboard />);

    expect(await screen.findByText("Module coming soon")).toBeTruthy();
    expect(screen.getByText("retail")).toBeTruthy();
    expect(screen.getByText(/module is not available yet/i)).toBeTruthy();
  });

  it("renders grosir dashboard totals and top products for manager tenants", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "user-2",
      tenantId: "tenant-2",
      role: "manager",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockResolvedValue({
      todaySalesTotal: 125000,
      todayTxnCount: 7,
      lowStockCount: 3,
      topProducts: [
        { product_id: "prod-beras", name: "Beras Ramos", qty_sold: 12 },
        { product_id: "prod-gula", name: "Gula Pasir", qty_sold: 5 },
      ],
    });
    vi.mocked(apiFetch).mockResolvedValue({
      plan: { code: "free", name: "Free", priceIdr: 0, quota: { skus: 100, tx_per_month: 1000 } },
      subscription: { status: "active", currentPeriodEnd: "2026-06-16T00:00:00.000Z" },
      usage: { skus: 75, tx_per_month: 120 },
      invoices: [],
    });

    renderWithQuery(<TenantDashboard />);

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Penjualan hari ini")).toBeTruthy();
    expect(screen.getByText("Rp 125.000")).toBeTruthy();
    expect(screen.getByText("Transaksi hari ini")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("Produk stok menipis")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Penggunaan kuota" })).toBeTruthy();
    expect(screen.getByText("Produk (SKU)")).toBeTruthy();
    expect(screen.getByText("75 / 100")).toBeTruthy();
    expect(screen.getByText("Transaksi / bulan")).toBeTruthy();
    expect(screen.getByText("120 / 1.000")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Produk terlaris (30 hari)" })).toBeTruthy();
    expect(screen.getByText("✦ Beras Ramos — 12")).toBeTruthy();
    expect(screen.getByText("✦ Gula Pasir — 5")).toBeTruthy();
    expect(grosirApi).toHaveBeenCalledWith("/dashboard");
    expect(apiFetch).toHaveBeenCalledWith("/billing/summary");
  });

  it("renders the same sales dashboard for cashier tenants", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "cashier-1",
      tenantId: "tenant-2",
      role: "cashier",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockResolvedValue({
      todaySalesTotal: 25000,
      todayTxnCount: 2,
      lowStockCount: 0,
      topProducts: [],
    });

    renderWithQuery(<TenantDashboard />);

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Rp 25.000")).toBeTruthy();
    expect(screen.getByText("Cashier dapat melihat ringkasan penjualan tanpa akses laporan lanjutan.")).toBeTruthy();
  });

  it("shows loading and error states while fetching the grosir dashboard", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "user-2",
      tenantId: "tenant-2",
      role: "manager",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockRejectedValue(new Error("network down"));

    renderWithQuery(<TenantDashboard />);

    expect(await screen.findByText("Loading…")).toBeTruthy();
    expect(await screen.findByText("Dashboard belum bisa dimuat.")).toBeTruthy();
  });
});
