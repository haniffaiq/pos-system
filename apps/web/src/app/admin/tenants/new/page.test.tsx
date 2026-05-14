import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../../../../lib/auth";
import NewTenantPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("NewTenantPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    push.mockReset();
    setSession({ accessToken: "admin-token", refreshToken: "refresh", role: "platform_admin", tenantId: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("registers a tenant owner and routes to the tenant detail page", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "tenant-123" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();
    await fillInput("name", "Toko Baru");
    await fillInput("slug", "toko-baru");
    await selectValue("sector", "grosir");
    await fillInput("ownerEmail", "owner@toko.test");
    await fillInput("ownerPassword", "ownerpass123");

    await submitForm();
    await flushReact();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/admin/tenants",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Toko Baru",
          slug: "toko-baru",
          sector: "grosir",
          ownerEmail: "owner@toko.test",
          ownerPassword: "ownerpass123",
        }),
        headers: expect.any(Headers),
      }),
    );
    expect(push).toHaveBeenCalledWith("/admin/tenants/tenant-123");
  });

  it("shows validation and API errors without navigating", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "conflict", message: "Slug already exists" } }), { status: 409 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();
    await submitForm();
    await flushReact();

    expect(container.textContent).toContain("String must contain at least 2 character(s)");
    expect(container.textContent).toContain("Invalid email");
    expect(fetchMock).not.toHaveBeenCalled();

    await fillInput("name", "Toko Baru");
    await fillInput("slug", "toko-baru");
    await selectValue("sector", "retail");
    await fillInput("ownerEmail", "owner@toko.test");
    await fillInput("ownerPassword", "ownerpass123");
    await submitForm();
    await flushReact();

    expect(container.textContent).toContain("Slug already exists");
    expect(push).not.toHaveBeenCalled();
  });

  async function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <NewTenantPage />
        </QueryClientProvider>,
      );
    });
    await flushReact();
  }

  async function fillInput(name: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    expect(input).not.toBeNull();
    await act(async () => {
      const inputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      inputValueSetter?.call(input, value);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function selectValue(name: string, value: string) {
    const select = container.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
    expect(select).not.toBeNull();
    await act(async () => {
      select!.value = value;
      select!.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  async function submitForm() {
    await act(async () => {
      container.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  async function flushReact() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
});
