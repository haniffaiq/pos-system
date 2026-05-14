import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../../../lib/auth";
import TenantsPage from "./page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("TenantsPage", () => {
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

  it("lists tenants with status badges and register tenant action", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          { id: "tenant-1", name: "Toko Sumber", slug: "toko-sumber", sector: "grosir", status: "active" },
          { id: "tenant-2", name: "Kopi Pagi", slug: "kopi-pagi", sector: "fnb", status: "suspended" },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();
    await flushReact();

    expect(container.textContent).toContain("Tenants");
    expect(container.querySelector('a[href="/admin/tenants/new"]')?.textContent).toContain("Register tenant");
    expect(container.textContent).toContain("Toko Sumber");
    expect(container.textContent).toContain("active");
    expect(container.textContent).toContain("Kopi Pagi");
    expect(container.textContent).toContain("suspended");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/admin/tenants",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("sends status and search filters to the tenants API", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();
    const search = container.querySelector<HTMLInputElement>('input[name="search"]');
    const status = container.querySelector<HTMLSelectElement>('select[name="status"]');
    expect(search).not.toBeNull();
    expect(status).not.toBeNull();

    await act(async () => {
      const inputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      inputValueSetter?.call(search, "kopi");
      search!.dispatchEvent(new Event("input", { bubbles: true }));
      status!.value = "suspended";
      status!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flushReact();

    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:4000/api/v1/admin/tenants?status=suspended&search=kopi",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  async function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <TenantsPage />
        </QueryClientProvider>,
      );
    });
    await flushReact();
  }

  async function flushReact() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
});
