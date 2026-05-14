import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminLoginPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("admin login page", () => {
  afterEach(() => cleanup());

  it("renders the admin login form inside a centered auth shell", () => {
    const { container } = render(<AdminLoginPage />);

    expect(screen.getByText("Platform Admin")).toBeTruthy();
    expect(container.querySelector("main")?.className).toContain("min-h-screen");
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });
});
