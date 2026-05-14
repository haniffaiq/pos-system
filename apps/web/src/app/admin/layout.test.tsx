import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../../lib/auth";
import AdminLayout from "./layout";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("AdminLayout", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    push.mockClear();
    replace.mockClear();
    setSession({ accessToken: "admin-token", refreshToken: "refresh", role: "platform_admin", tenantId: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders a protected neo-brutalist admin shell with sidebar navigation", async () => {
    await act(async () => {
      root.render(
        <AdminLayout>
          <section>Tenant list body</section>
        </AdminLayout>,
      );
    });

    expect(container.textContent).toContain("Operational · Admin");
    expect(container.textContent).toContain("Tenant list body");
    expect(container.querySelector('a[href="/admin"]')?.textContent).toContain("Dashboard");
    expect(container.querySelector('a[href="/admin/tenants"]')?.textContent).toContain("Tenants");
    expect(container.querySelector("aside")?.className).toContain("border-r-2");
    expect(replace).not.toHaveBeenCalled();
  });

  it("clears the session and returns to admin login on logout", async () => {
    await act(async () => {
      root.render(
        <AdminLayout>
          <section>Tenant list body</section>
        </AdminLayout>,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")!.click();
    });

    expect(localStorage.getItem("owa.session")).toBeNull();
    expect(push).toHaveBeenCalledWith("/admin/login");
  });
});
