import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdjustmentsPage from "./page";

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

const product = { id: "prod-1", sku: "BRS-5", name: "Beras 5kg", baseUnitName: "pcs", stockQty: 12 };
const adjustment = {
  id: "adj-1",
  product_id: "prod-1",
  qty_base: -5,
  reason: "rusak",
  note: "Kemasan robek",
  created_at: "2026-05-14T12:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("grosir stock adjustments page", () => {
  it("lists recent adjustments with product names, signed quantity, reason, and note", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "owner-1",
      tenantId: "tenant-1",
      role: "owner",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockImplementation(async (path: string) => {
      if (path === "/products") return [product];
      if (path === "/adjustments") return [adjustment];
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<AdjustmentsPage params={{ slug: "warung-maju" }} />);

    expect(await screen.findByText("Penyesuaian Stok")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("Beras 5kg").length).toBeGreaterThan(0));
    expect(screen.getByText((_, node) => node?.textContent === "-5 pcs")).toBeTruthy();
    expect(screen.getAllByText("Rusak").length).toBeGreaterThan(0);
    expect(screen.getByText("Kemasan robek")).toBeTruthy();
  });

  it("lets managers post signed quantity adjustments and refresh products plus adjustments", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "manager-1",
      tenantId: "tenant-1",
      role: "manager",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ...adjustment, id: "adj-2" };
      if (path === "/products") return [product];
      if (path === "/adjustments") return [];
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<AdjustmentsPage params={{ slug: "warung-maju" }} />);

    await screen.findByText("Beras 5kg");
    fireEvent.change(await screen.findByLabelText("Produk"), { target: { value: "prod-1" } });
    fireEvent.change(screen.getByLabelText("Qty signed"), { target: { value: "-5" } });
    fireEvent.change(screen.getByLabelText("Alasan"), { target: { value: "rusak" } });
    fireEvent.change(screen.getByLabelText("Catatan"), { target: { value: "Kemasan robek" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Simpan penyesuaian" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Simpan penyesuaian" }));

    await waitFor(() => {
      expect(grosirApi).toHaveBeenCalledWith(
        "/adjustments",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            productId: "prod-1",
            qtyBase: -5,
            reason: "rusak",
            note: "Kemasan robek",
          }),
        }),
      );
    });
    await waitFor(() => expect(screen.getByLabelText("Produk")).toHaveProperty("value", ""));
    expect(screen.getByLabelText("Qty signed")).toHaveProperty("value", "0");
    expect(screen.getByLabelText("Catatan")).toHaveProperty("value", "");
  });

  it("hides the adjustment form from cashiers while keeping the recent list readable", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "cashier-1",
      tenantId: "tenant-1",
      role: "cashier",
      sector: "grosir",
    });
    vi.mocked(grosirApi).mockImplementation(async (path: string) => {
      if (path === "/products") return [product];
      if (path === "/adjustments") return [adjustment];
      throw new Error(`unexpected path ${path}`);
    });

    renderWithQuery(<AdjustmentsPage params={{ slug: "warung-maju" }} />);

    expect(await screen.findByText("Beras 5kg")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Simpan penyesuaian" })).toBeNull();
    expect(screen.getByText("Owner/manager only")).toBeTruthy();
  });
});
