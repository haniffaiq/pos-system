import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "./page";

vi.mock("@/lib/grosir", () => ({
  grosirApi: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  fetchTenantContext: vi.fn(),
  tenantContextKey: (slug: string) => ["tenant-ctx", slug],
  tenantQueryKey: (tenantId: string | null | undefined, ...parts: string[]) => ["tenant", tenantId ?? "unknown", ...parts],
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/auth";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext } from "@/lib/tenant";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const salesReport = {
  rows: [
    {
      id: "sale-1",
      invoice_no: "INV-001",
      customer_name: "Pak Budi",
      total: 125000,
      payment_method: "cash",
      created_at: "2026-05-14T09:30:00.000Z",
    },
  ],
  grandTotal: 125000,
};

const stockRows = [
  { product_id: "prod-beras", sku: "BRS-5", name: "Beras 5kg", stock_qty: 3, min_stock: 5 },
  { product_id: "prod-gula", sku: "GUL-1", name: "Gula 1kg", stock_qty: 12, min_stock: 5 },
];

const exportJobs = [
  { id: "export-1", type: "sales", status: "done", file_path: "/tmp/sales.csv", created_at: "2026-05-14T10:00:00.000Z" },
  { id: "export-2", type: "stock", status: "processing", file_path: null, created_at: "2026-05-14T10:05:00.000Z" },
];

function mockOwnerContext() {
  vi.mocked(fetchTenantContext).mockResolvedValue({
    userId: "owner-1",
    tenantId: "tenant-1",
    role: "owner",
    sector: "grosir",
  });
}

function mockReportApis() {
  vi.mocked(grosirApi).mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST" && path === "/reports/exports") {
      return { id: "export-new", type: "sales", status: "pending", file_path: null, created_at: "now" };
    }
    if (path.startsWith("/reports/sales?")) return salesReport;
    if (path.startsWith("/reports/stock?")) return stockRows;
    if (path === "/reports/exports") return exportJobs;
    throw new Error(`unexpected grosirApi call ${path}`);
  });
}

beforeEach(() => {
  vi.mocked(getSession).mockReturnValue({
    role: "owner",
    tenantId: "tenant-1",
  });
  mockOwnerContext();
  mockReportApis();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("grosir reports page", () => {
  it("shows sales and stock reports for the selected date range", async () => {
    renderWithQuery(<ReportsPage params={{ slug: "warung-maju" }} />);

    expect(await screen.findByRole("heading", { name: "Laporan" })).toBeTruthy();
    expect(await screen.findByText("INV-001")).toBeTruthy();
    expect(screen.getAllByText("Rp 125.000").length).toBeGreaterThan(0);
    expect(screen.getByText("cash")).toBeTruthy();
    expect(await screen.findByText("Beras 5kg")).toBeTruthy();
    expect(screen.getByText("BRS-5")).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent === "3 unitmenipis")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Dari"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByLabelText("Sampai"), { target: { value: "2026-05-14" } });

    await waitFor(() => {
      expect(grosirApi).toHaveBeenCalledWith("/reports/sales?from=2026-05-01&to=2026-05-14");
      expect(grosirApi).toHaveBeenCalledWith("/reports/stock?from=2026-05-01&to=2026-05-14");
    });
  });

  it("starts sales and stock export jobs with the selected date range and shows polling status", async () => {
    renderWithQuery(<ReportsPage params={{ slug: "warung-maju" }} />);

    fireEvent.change(await screen.findByLabelText("Dari"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByLabelText("Sampai"), { target: { value: "2026-05-14" } });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV penjualan" }));
    fireEvent.click(screen.getByRole("button", { name: "Export CSV stok" }));

    await waitFor(() => {
      expect(grosirApi).toHaveBeenCalledWith(
        "/reports/exports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ type: "sales", params: { from: "2026-05-01", to: "2026-05-14" } }),
        }),
      );
      expect(grosirApi).toHaveBeenCalledWith(
        "/reports/exports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ type: "stock", params: { from: "2026-05-01", to: "2026-05-14" } }),
        }),
      );
    });

    expect(await screen.findByText("sales")).toBeTruthy();
    expect(screen.getByText("done")).toBeTruthy();
    expect(screen.getByText("stock")).toBeTruthy();
    expect(screen.getByText("processing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download sales export" })).toBeTruthy();
  });

  it("downloads done export jobs through the authenticated download route", async () => {
    const objectUrl = "blob:download";
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => objectUrl) });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const createObjectURL = vi.mocked(URL.createObjectURL);
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("invoice_no,total\nINV-001,125000\n"));
    const click = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName) as HTMLAnchorElement;
      if (tagName === "a") element.click = click;
      return element as HTMLElement;
    });

    renderWithQuery(<ReportsPage params={{ slug: "warung-maju" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Download sales export" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/api/v1/t/tenant-1/m/reports/exports/export-1/download",
        { credentials: "include" },
      );
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    const downloadedBlob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(downloadedBlob).toBeTruthy();
    expect(downloadedBlob.size).toBe(32);
    expect(downloadedBlob.type).toBe("text/plain;charset=utf-8");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("keeps reports owner/manager only by hiding report data and export controls from cashiers", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "cashier-1",
      tenantId: "tenant-1",
      role: "cashier",
      sector: "grosir",
    });

    renderWithQuery(<ReportsPage params={{ slug: "warung-maju" }} />);

    expect(await screen.findByText("Owner/manager only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Export CSV penjualan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export CSV stok" })).toBeNull();
    await waitFor(() => expect(grosirApi).not.toHaveBeenCalled());
  });
});
