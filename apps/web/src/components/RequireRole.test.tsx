import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSession } from "@/lib/auth";
import { RequireRole } from "./RequireRole";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  replace.mockClear();
});

describe("RequireRole", () => {
  it("renders children for the required platform admin role", async () => {
    setSession({ accessToken: "access", refreshToken: "refresh", role: "platform_admin", tenantId: null });

    render(
      <RequireRole role="platform_admin" redirect="/admin/login">
        <main>Protected admin area</main>
      </RequireRole>,
    );

    expect(await screen.findByText("Protected admin area")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects and hides children when the session role does not match", async () => {
    setSession({ accessToken: "access", refreshToken: "refresh", role: "cashier", tenantId: "tenant-1" });

    render(
      <RequireRole role="platform_admin" redirect="/admin/login">
        <main>Protected admin area</main>
      </RequireRole>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/login"));
    expect(screen.queryByText("Protected admin area")).toBeNull();
  });

  it("renders children when the current tenant role is included in the allowed roles", async () => {
    setSession({ accessToken: "access-1", refreshToken: "refresh-1", role: "manager", tenantId: "tenant-1" });

    render(
      <RequireRole role={["owner", "manager", "cashier"]} redirect="/t/warung/login">
        <p>Tenant dashboard</p>
      </RequireRole>,
    );

    expect(await screen.findByText("Tenant dashboard")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects when there is no session with an allowed role", async () => {
    render(
      <RequireRole role={["owner", "manager", "cashier"]} redirect="/t/warung/login">
        <p>Tenant dashboard</p>
      </RequireRole>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/t/warung/login"));
    expect(screen.queryByText("Tenant dashboard")).toBeNull();
  });
});
