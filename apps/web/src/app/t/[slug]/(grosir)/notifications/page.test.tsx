import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotificationsPage from "./page";


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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("grosir notifications page", () => {
  it("lists low-stock notifications with unread badge and processor dedupe context", async () => {
    vi.mocked(grosirApi).mockResolvedValue([
      {
        id: "notif-1",
        type: "low_stock",
        title: "Stok menipis",
        body: "Beras Ramos tersisa 2 (minimum 5)",
        metadata: { product_id: "prod-beras", stock_qty: 2, min_stock: 5 },
        is_read: false,
        created_at: "2026-05-15T04:00:00.000Z",
      },
    ]);

    renderWithQuery(<NotificationsPage params={{ slug: "warung-maju" }} />);

    expect(await screen.findByRole("heading", { name: "Notifikasi" })).toBeTruthy();
    expect(await screen.findByText("Stok menipis")).toBeTruthy();
    expect(screen.getByText("Beras Ramos tersisa 2 (minimum 5)")).toBeTruthy();
    expect(screen.getByText("baru")).toBeTruthy();
    expect(screen.getByText("Stok saat ini 2, minimum 5")).toBeTruthy();
    expect(screen.getByText("Low-stock scanner membuat maksimal satu notifikasi unread per produk.")).toBeTruthy();
    expect(grosirApi).toHaveBeenCalledWith("/notifications");
  });

  it("marks an unread notification as read through the grosir notifications API", async () => {
    vi.mocked(grosirApi).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/notifications" && !init) {
        return [
          {
            id: "notif-1",
            type: "low_stock",
            title: "Stok menipis",
            body: "Gula tersisa 1 (minimum 3)",
            metadata: { product_id: "prod-gula", stock_qty: 1, min_stock: 3 },
            is_read: false,
            created_at: "2026-05-15T04:00:00.000Z",
          },
        ];
      }
      if (path === "/notifications/notif-1/read" && init?.method === "PATCH") return { ok: true };
      throw new Error(`unexpected call ${path}`);
    });

    renderWithQuery(<NotificationsPage params={{ slug: "warung-maju" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Tandai dibaca" }));

    await waitFor(() => {
      expect(grosirApi).toHaveBeenCalledWith("/notifications/notif-1/read", { method: "PATCH" });
    });
  });

  it("shows an empty state when the tenant has no notifications", async () => {
    vi.mocked(grosirApi).mockResolvedValue([]);

    renderWithQuery(<NotificationsPage params={{ slug: "warung-maju" }} />);

    expect(await screen.findByText("Belum ada notifikasi." )).toBeTruthy();
  });
});
