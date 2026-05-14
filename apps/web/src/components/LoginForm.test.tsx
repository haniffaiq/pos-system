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

  it("persists platform admin tokens and routes to admin shell", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
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
    expect(mockedSetSession).toHaveBeenCalledWith({
      accessToken: "admin-access",
      refreshToken: "admin-refresh",
      role: "platform_admin",
      tenantId: null,
    });
    expect(push).toHaveBeenCalledWith("/admin");
  });

  it("persists tenant user tokens and routes to tenant shell", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      accessToken: "tenant-access",
      refreshToken: "tenant-refresh",
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
      accessToken: "tenant-access",
      refreshToken: "tenant-refresh",
      role: "owner",
      tenantId: "tenant-1",
    });
    expect(push).toHaveBeenCalledWith("/t/warung-maju");
  });

  it("renders a uniform bad credentials error without persisting tokens", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError("invalid_credentials", "Invalid email or password", 401));
    render(<LoginForm mode="admin" />);

    await submitLogin("wrong@example.com", "password123");

    expect(await screen.findByText("Invalid email or password")).toBeTruthy();
    expect(mockedSetSession).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
