import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TenantDashboard from "./page";

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

  it("keeps the grosir placeholder wired for the Phase 2 module", async () => {
    vi.mocked(fetchTenantContext).mockResolvedValue({
      userId: "user-2",
      tenantId: "tenant-2",
      role: "manager",
      sector: "grosir",
    });

    renderWithQuery(<TenantDashboard />);

    expect(await screen.findByText("Grosir module loads here (Phase 2)." )).toBeTruthy();
  });
});
