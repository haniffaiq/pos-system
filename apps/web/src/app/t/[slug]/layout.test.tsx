import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSession } from "@/lib/auth";
import TenantLayout from "./layout";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/lib/tenant", () => ({
  fetchTenantContext: vi.fn(),
}));

import { fetchTenantContext } from "@/lib/tenant";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("tenant layout", () => {
  it("renders the tenant shell, sidebar, and sector marker for tenant roles", async () => {
    setSession({ accessToken: "access-1", refreshToken: "refresh-1", role: "cashier", tenantId: "tenant-1" });
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "cashier",
      sector: "retail",
    });

    const { container } = renderWithQuery(
      <TenantLayout params={{ slug: "warung-maju" }}>
        <p>Dashboard content</p>
      </TenantLayout>,
    );

    expect(await screen.findByText("Operational · warung-maju")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/t/warung-maju");
    expect(screen.getByText("Dashboard content")).toBeTruthy();
    await waitFor(() => expect(container.querySelector("main")?.getAttribute("data-sector")).toBe("retail"));
  });

  it("shows grosir module links for grosir tenants", async () => {
    setSession({ accessToken: "access-1", refreshToken: "refresh-1", role: "manager", tenantId: "tenant-1" });
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "manager",
      sector: "grosir",
    });

    renderWithQuery(
      <TenantLayout params={{ slug: "warung-maju" }}>
        <p>Dashboard content</p>
      </TenantLayout>,
    );

    expect((await screen.findByRole("link", { name: "POS / Penjualan" })).getAttribute("href")).toBe(
      "/t/warung-maju/pos",
    );
    expect(screen.getByRole("link", { name: "Produk" }).getAttribute("href")).toBe("/t/warung-maju/products");
    expect(screen.getByRole("link", { name: "Barang Masuk" }).getAttribute("href")).toBe(
      "/t/warung-maju/stock-in",
    );
    expect(screen.getByRole("link", { name: "Penyesuaian Stok" }).getAttribute("href")).toBe(
      "/t/warung-maju/adjustments",
    );
    expect(screen.getByRole("link", { name: "Master Data" }).getAttribute("href")).toBe(
      "/t/warung-maju/masterdata",
    );
    expect(screen.getByRole("link", { name: "Laporan" }).getAttribute("href")).toBe("/t/warung-maju/reports");
    expect(screen.getByRole("link", { name: "Notifikasi" }).getAttribute("href")).toBe(
      "/t/warung-maju/notifications",
    );
  });

  it("logs out by clearing the tenant session and returning to tenant login", async () => {
    setSession({ accessToken: "access-1", refreshToken: "refresh-1", role: "owner", tenantId: "tenant-1" });
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "owner",
      sector: "retail",
    });

    renderWithQuery(
      <TenantLayout params={{ slug: "warung-maju" }}>
        <p>Dashboard content</p>
      </TenantLayout>,
    );

    (await screen.findByRole("button", { name: "Log out" })).click();

    expect(localStorage.getItem("owa.session")).toBeNull();
    expect(push).toHaveBeenCalledWith("/t/warung-maju/login");
  });
});
