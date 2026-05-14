import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../../../lib/auth";
import AuditLogPage from "./page";

describe("AuditLogPage", () => {
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

  it("renders audit actions, targets, admins, timestamps, and meta safely", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: "audit-1",
            admin_id: "admin-1",
            action: "tenant.create",
            target: "tenant-1",
            meta: { note: "<script>alert('xss')</script>", actor: "platform" },
            created_at: "2026-05-14T10:11:12.000Z",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();
    await flushReact();

    expect(container.textContent).toContain("Audit log");
    expect(container.textContent).toContain("tenant.create");
    expect(container.textContent).toContain("tenant-1");
    expect(container.textContent).toContain("admin-1");
    expect(container.textContent).toContain("note");
    expect(container.textContent).toContain("<script>alert('xss')</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/admin/audit-log",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("shows an empty audit-log row when there are no entries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));

    await renderPage();
    await flushReact();

    expect(container.textContent).toContain("No audit entries yet.");
  });

  async function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <AuditLogPage />
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
