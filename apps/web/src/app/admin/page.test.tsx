import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../../lib/auth";
import AdminDashboard from "./page";

const messages = {
  admin: {
    billingPsp: {
      title: "Billing PSP",
      active: "Active: {psp}",
      effective: "Effective: {psp}",
      fallback: "Fallback: {psp}",
      ready: "{psp}: ready",
      missing: "{psp}: missing {missing}",
      invalid: "invalid",
      none: "none",
      loading: "Loading PSP settings…",
    },
  },
};

describe("AdminDashboard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setSession({ accessToken: "admin-token", refreshToken: "refresh", role: "platform_admin", tenantId: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders platform stats, recent registrations, and billing PSP readiness", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total: 2,
            bySector: [
              { sector: "grosir", n: 1 },
              { sector: "fnb", n: 1 },
            ],
            recent: [
              { id: "tenant-1", name: "Toko Sumber", slug: "toko-sumber", sector: "grosir", createdAt: "2026-05-14T10:00:00.000Z" },
              { id: "tenant-2", name: "Kopi Pagi", slug: "kopi-pagi", sector: "fnb", createdAt: "2026-05-14T09:00:00.000Z" },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            activePsp: "midtrans",
            effectivePsp: "xendit",
            fallbackPsp: "xendit",
            providers: [
              { name: "midtrans", configured: false, missingConfig: ["MIDTRANS_SERVER_KEY"] },
              { name: "xendit", configured: true, missingConfig: [] },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();
    await flushReact();

    expect(container.textContent).toContain("Dashboard");
    expect(container.textContent).toContain("Total tenants");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("grosir");
    expect(container.textContent).toContain("fnb");
    expect(container.textContent).toContain("Recent registrations");
    expect(container.textContent).toContain("Toko Sumber");
    expect(container.textContent).toContain("toko-sumber");
    expect(container.textContent).toContain("Billing PSP");
    expect(container.textContent).toContain("Active: midtrans");
    expect(container.textContent).toContain("Effective: xendit");
    expect(container.textContent).toContain("MIDTRANS_SERVER_KEY");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/admin/stats",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("shows a loading state while stats are pending", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);

    await renderPage({ settle: false });

    expect(container.textContent).toContain("Loading dashboard");
  });

  it("shows the API error message when stats fail", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "internal_error", message: "Stats unavailable" } }), { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();
    await flushReact();

    expect(container.textContent).toContain("Stats unavailable");
  });

  async function renderPage({ settle = true }: { settle?: boolean } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <NextIntlClientProvider locale="en" messages={messages}>
            <AdminDashboard />
          </NextIntlClientProvider>
        </QueryClientProvider>,
      );
    });
    if (settle) await flushReact();
  }

  async function flushReact() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
});
