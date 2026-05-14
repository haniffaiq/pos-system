import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../lib/auth";
import { RequireRole } from "./RequireRole";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

describe("RequireRole", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    replace.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders children for the required platform admin role", async () => {
    setSession({ accessToken: "access", refreshToken: "refresh", role: "platform_admin", tenantId: null });

    await act(async () => {
      root.render(
        <RequireRole role="platform_admin" redirect="/admin/login">
          <main>Protected admin area</main>
        </RequireRole>,
      );
    });

    expect(container.textContent).toContain("Protected admin area");
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects and hides children when the session role does not match", async () => {
    setSession({ accessToken: "access", refreshToken: "refresh", role: "cashier", tenantId: "tenant-1" });

    await act(async () => {
      root.render(
        <RequireRole role="platform_admin" redirect="/admin/login">
          <main>Protected admin area</main>
        </RequireRole>,
      );
    });

    expect(container.textContent).not.toContain("Protected admin area");
    expect(replace).toHaveBeenCalledWith("/admin/login");
  });
});
