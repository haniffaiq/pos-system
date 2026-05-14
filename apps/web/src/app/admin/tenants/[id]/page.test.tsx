import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../../../../lib/auth";
import TenantDetailPage from "./page";

describe("TenantDetailPage", () => {
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

  it("shows tenant details, owner users, and suspends active tenants", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/admin/tenants/tenant-1/status")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(activeTenant()), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderPage("tenant-1");
    await flushReact();

    expect(container.textContent).toContain("Toko Sumber");
    expect(container.textContent).toContain("toko-sumber · grosir");
    expect(container.textContent).toContain("Owner Sumber");
    expect(container.textContent).toContain("owner@sumber.test");
    expect(container.textContent).toContain("owner");

    await clickButton("Suspend");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/admin/tenants/tenant-1/status",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "suspended" }) }),
    );
  });

  it("activates suspended tenants", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/admin/tenants/tenant-2/status")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ...activeTenant(), id: "tenant-2", status: "suspended" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderPage("tenant-2");
    await flushReact();

    expect(container.textContent).toContain("suspended");
    await clickButton("Activate");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/admin/tenants/tenant-2/status",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "active" }) }),
    );
  });

  async function renderPage(id: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <TenantDetailPage params={{ id }} />
        </QueryClientProvider>,
      );
    });
  }

  async function clickButton(text: string) {
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(text));
    expect(button).not.toBeUndefined();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
  }

  async function flushReact() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function activeTenant() {
    return {
      id: "tenant-1",
      name: "Toko Sumber",
      slug: "toko-sumber",
      sector: "grosir",
      status: "active",
      users: [{ id: "user-1", email: "owner@sumber.test", name: "Owner Sumber", role: "owner", status: "active" }],
    };
  }
});
