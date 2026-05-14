import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TenantLoginPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("tenant login page", () => {
  afterEach(() => cleanup());

  it("renders the tenant login form for the route slug", () => {
    render(<TenantLoginPage params={{ slug: "warung-maju" }} />);

    expect(screen.getByText("Sign in", { selector: "h1" })).toBeTruthy();
    expect(screen.getByText("warung-maju")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });
});
