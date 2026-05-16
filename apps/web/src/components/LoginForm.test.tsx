import React from "react";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  setSession: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedSetSession = vi.mocked(setSession);

async function submitLogin(email = "owner@example.com", password = "password123") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedSetSession.mockReset();
    push.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("validates email and password before submitting", async () => {
    render(<LoginForm mode="admin" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email")).toBeTruthy();
    expect(await screen.findByText("String must contain at least 8 character(s)")).toBeTruthy();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("keeps the server-rendered submit button disabled until the client has hydrated", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const markup = renderToString(<LoginForm mode="admin" />);

    expect(markup).toContain("disabled=\"\"");
    consoleError.mockRestore();
  });

  it("stores safe platform admin metadata and routes to admin shell", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      admin: { id: "admin-1" },
    });
    render(<LoginForm mode="admin" />);

    await submitLogin("admin@example.com", "password123");

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/auth/admin-login", {
        method: "POST",
        body: JSON.stringify({ email: "admin@example.com", password: "password123" }),
      });
    });
    expect(mockedSetSession).toHaveBeenCalledWith({ role: "platform_admin", tenantId: null });
    expect(push).toHaveBeenCalledWith("/admin");
  });

  it("stores safe tenant user metadata and routes to tenant shell", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      user: { role: "owner", tenantId: "tenant-1" },
    });
    render(<LoginForm mode="tenant" slug="warung-maju" />);

    await submitLogin();

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/auth/tenant-login", {
        method: "POST",
        body: JSON.stringify({ email: "owner@example.com", password: "password123", slug: "warung-maju" }),
      });
    });
    expect(mockedSetSession).toHaveBeenCalledWith({
      role: "owner",
      tenantId: "tenant-1",
      tenantSlug: "warung-maju",
    });
    expect(push).toHaveBeenCalledWith("/t/warung-maju");
  });

  it("renders and completes the MFA challenge before routing", async () => {
    mockedApiFetch
      .mockRejectedValueOnce(
        new ApiError("MFA_REQUIRED", "Multi-factor authentication is required", 401, {
          challengeToken: "challenge-1",
          methods: ["totp", "email_otp"],
        }),
      )
      .mockResolvedValueOnce({ user: { role: "owner", tenantId: "tenant-1" } });
    render(<LoginForm mode="tenant" slug="warung-maju" />);

    await submitLogin();

    expect(await screen.findByText("Multi-factor authentication")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("6-digit MFA code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenLastCalledWith("/auth/mfa/challenge/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken: "challenge-1", method: "totp", code: "654321" }),
      }),
    );
    expect(mockedSetSession).toHaveBeenCalledWith({ role: "owner", tenantId: "tenant-1", tenantSlug: "warung-maju" });
    expect(push).toHaveBeenCalledWith("/t/warung-maju");
  });
});
