import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MasterDataPage from "./page";

vi.mock("@/lib/grosir", () => ({
  grosirApi: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  fetchTenantContext: vi.fn(),
  tenantContextKey: (slug: string) => ["tenant-ctx", slug],
  tenantQueryKey: (tenantId: string | null | undefined, ...parts: string[]) => ["tenant", tenantId ?? "unknown", ...parts],
}));

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

describe("grosir master data page", () => {
  it("lists categories units and suppliers from the grosir masterdata API", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "owner-1",
      tenantId: "tenant-1",
      role: "owner",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockImplementation(async (path: string) => {
      if (path === "/masterdata/categories") return [{ id: "cat-1", name: "Beras" }];
      if (path === "/masterdata/units") return [{ id: "unit-1", name: "Karung" }];
      if (path === "/masterdata/suppliers") return [{ id: "supplier-1", name: "Gudang Jaya" }];
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<MasterDataPage params={{ slug: "warung-maju" }} />);

    expect(await screen.findByText("Master Data")).toBeTruthy();
    expect(await screen.findByText("Beras")).toBeTruthy();
    expect(await screen.findByText("Karung")).toBeTruthy();
    expect(await screen.findByText("Gudang Jaya")).toBeTruthy();
  });

  it("lets owners create a supplier by name only and refreshes the supplier list", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "owner-1",
      tenantId: "tenant-1",
      role: "owner",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return { id: "supplier-2", name: "Toko Makmur" };
      if (path === "/masterdata/categories") return [];
      if (path === "/masterdata/units") return [];
      if (path === "/masterdata/suppliers") return [];
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<MasterDataPage params={{ slug: "warung-maju" }} />);

    const supplierInput = await screen.findByLabelText("Nama Supplier");
    fireEvent.change(supplierInput, { target: { value: "Toko Makmur" } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah Supplier" }));

    await waitFor(() => {
      expect(grosirApi).toHaveBeenCalledWith(
        "/masterdata/suppliers",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Toko Makmur" }) }),
      );
    });
    expect((supplierInput as HTMLInputElement).value).toBe("");
  });

  it("hides create forms from cashiers while keeping lists readable", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "cashier-1",
      tenantId: "tenant-1",
      role: "cashier",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockImplementation(async (path: string) => {
      if (path === "/masterdata/categories") return [{ id: "cat-1", name: "Minuman" }];
      if (path === "/masterdata/units") return [];
      if (path === "/masterdata/suppliers") return [];
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<MasterDataPage params={{ slug: "warung-maju" }} />);

    expect(await screen.findByText("Minuman")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Tambah/ })).toBeNull();
    expect(screen.getAllByText("Owner/manager only").length).toBeGreaterThan(0);
  });
});
